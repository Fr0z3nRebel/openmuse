import type { Config } from "./config.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";

/**
 * Model selection for chat. v1 manages one provider, Ollama, reached through the
 * OpenAI-compatible route the agent adapter already supports; the settings record
 * carries a provider field so more providers can be added without a data migration.
 * A global default lives in the settings store, and each chat thread can override
 * it. The model is resolved fresh on every run, so a change applies to the next
 * message and never rewrites a conversation's history.
 */
export interface ModelSettings {
  id: string;
  provider: "ollama";
  ollamaHost: string;
  ollamaPort: number;
  /** Bare Ollama model name, or a full "provider/model" spec for a non-Ollama seed. */
  defaultModel: string;
}

export interface ResolvedModel {
  spec: string;
  baseUrl?: string;
}

export interface ModelListEntry {
  name: string;
  spec: string;
  contextLength?: number;
}

export interface ModelList {
  models: ModelListEntry[];
  defaultSpec: string;
  error?: string;
}

export interface ThreadModel {
  spec: string;
  source: "thread" | "default";
  defaultSpec: string;
}

interface ThreadModelRecord {
  id: string;
  spec: string;
}

const settingsId = "model";
const threadKind = "thread-models";

export class ModelSettingsService {
  constructor(
    private readonly db: Store,
    private readonly config: Config,
  ) {}

  async settings(owner: string): Promise<ModelSettings> {
    const saved = await this.db.get<ModelSettings>(owner, "settings", settingsId);
    if (saved?.defaultModel) return { ...this.seed(), ...saved, id: settingsId };
    return this.seed();
  }

  async save(
    owner: string,
    input: { ollamaHost: string; ollamaPort: number; defaultModel: string },
  ): Promise<ModelSettings> {
    const host = input.ollamaHost.trim();
    if (!host || /[\s/:]/.test(host))
      throw new AppError("Enter the Ollama host as a name or IP address, without a port or scheme");
    if (!Number.isInteger(input.ollamaPort) || input.ollamaPort < 1 || input.ollamaPort > 65535)
      throw new AppError("The Ollama port must be a whole number between 1 and 65535");
    const defaultModel = input.defaultModel.trim();
    if (!defaultModel) throw new AppError("Choose a default model");
    const settings: ModelSettings = {
      id: settingsId,
      provider: "ollama",
      ollamaHost: host,
      ollamaPort: input.ollamaPort,
      defaultModel,
    };
    return this.db.put(owner, "settings", settings);
  }

  /** The model a run of this thread should use: the thread override, else the default. */
  async resolve(owner: string, threadId: string): Promise<ResolvedModel> {
    const settings = await this.settings(owner);
    const override = await this.db.get<ThreadModelRecord>(owner, threadKind, threadId);
    const spec = override?.spec || this.defaultSpec(settings);
    return {
      spec,
      baseUrl:
        settings.provider === "ollama" && spec.startsWith("openai/")
          ? `${this.ollamaBase(settings)}/v1`
          : undefined,
    };
  }

  async threadModel(owner: string, threadId: string): Promise<ThreadModel> {
    const settings = await this.settings(owner);
    const override = await this.db.get<ThreadModelRecord>(owner, threadKind, threadId);
    const defaultSpec = this.defaultSpec(settings);
    return override?.spec
      ? { spec: override.spec, source: "thread", defaultSpec }
      : { spec: defaultSpec, source: "default", defaultSpec };
  }

  async setThreadModel(owner: string, threadId: string, spec: string | null): Promise<ThreadModel> {
    if (spec === null) await this.db.remove(owner, threadKind, threadId);
    else await this.db.put(owner, threadKind, { id: threadId, spec } satisfies ThreadModelRecord);
    return this.threadModel(owner, threadId);
  }

  /** Models installed on the configured Ollama, with context sizes when it reports them. */
  async listModels(owner: string): Promise<ModelList> {
    const settings = await this.settings(owner);
    const defaultSpec = this.defaultSpec(settings);
    const base = this.ollamaBase(settings);
    try {
      const response = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Ollama answered HTTP ${response.status}`);
      const body = (await response.json()) as { models?: { name?: string }[] };
      const names = (body.models ?? [])
        .map((model) => model.name?.trim())
        .filter((name): name is string => Boolean(name));
      const models = await Promise.all(
        names.map(async (name) => ({
          name,
          spec: `openai/${name}`,
          contextLength: await this.contextLength(base, name),
        })),
      );
      return { models, defaultSpec };
    } catch (error) {
      return {
        models: [],
        defaultSpec,
        error: `Can't reach Ollama at ${settings.ollamaHost}:${settings.ollamaPort}. ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private defaultSpec(settings: ModelSettings): string {
    if (!settings.defaultModel) return this.config.model ?? "openai/unconfigured";
    return settings.defaultModel.includes("/")
      ? settings.defaultModel
      : `openai/${settings.defaultModel}`;
  }

  private ollamaBase(settings: ModelSettings): string {
    return `http://${settings.ollamaHost}:${settings.ollamaPort}`;
  }

  private async contextLength(base: string, name: string): Promise<number | undefined> {
    try {
      const response = await fetch(`${base}/api/show`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { model_info?: Record<string, unknown> };
      for (const [key, value] of Object.entries(body.model_info ?? {}))
        if (key.endsWith(".context_length") && typeof value === "number") return value;
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** First-run settings derived from the environment, so nothing changes until saved. */
  private seed(): ModelSettings {
    let host = "127.0.0.1";
    let port = 11434;
    try {
      const url = new URL(process.env.OPENAI_BASE_URL ?? "");
      if (url.hostname) host = url.hostname;
      if (url.port) port = Number(url.port);
    } catch {
      // No usable OPENAI_BASE_URL; the loopback defaults stand.
    }
    const envModel = this.config.model?.trim() ?? "";
    const defaultModel = envModel.startsWith("openai/")
      ? envModel.slice("openai/".length)
      : envModel;
    return { id: settingsId, provider: "ollama", ollamaHost: host, ollamaPort: port, defaultModel };
  }
}
