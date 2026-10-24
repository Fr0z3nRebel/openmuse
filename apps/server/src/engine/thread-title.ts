import { randomUUID } from "node:crypto";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import type { ModelSettingsService } from "../model-settings.ts";
import { tanstackAgent } from "./tanstack-agent.ts";

export const maxTitleLength = 60;

/** Tidies a model-written title: first non-empty line, no surrounding quotes, capped. */
export function cleanGeneratedTitle(raw: string): string {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return firstLine
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxTitleLength)
    .trim();
}

/** A usable title from the user's first message when no model is available. */
export function fallbackTitle(userText: string): string {
  const cleaned = userText
    .split(/\r?\n/)
    .filter((line) => !/^Attached (file|documents):/.test(line.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > maxTitleLength
    ? `${cleaned.slice(0, maxTitleLength - 1).trimEnd()}…`
    : cleaned;
}

export type TitleModelRunner = (
  spec: string,
  baseUrl: string | undefined,
  prompt: string,
) => Promise<string>;

async function runTitleModel(
  spec: string,
  baseUrl: string | undefined,
  prompt: string,
): Promise<string> {
  const agent = tanstackAgent({
    model: spec,
    modelBaseUrl: baseUrl,
    maxSteps: 1,
    tools: [],
    prompt: "You write short, plain titles for conversations. Answer with the title only.",
  });
  const input: RunAgentInput = {
    threadId: `title-${randomUUID()}`,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: prompt }],
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
  };
  let text = "";
  let runError: string | undefined;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      agent.abortRun();
      reject(new Error("Title generation timed out"));
    }, 30000);
    agent.run(input).subscribe({
      next: (event) => {
        if (
          (event.type === EventType.TEXT_MESSAGE_CHUNK ||
            event.type === EventType.TEXT_MESSAGE_CONTENT) &&
          "delta" in event &&
          typeof event.delta === "string"
        )
          text += event.delta;
        if (event.type === EventType.RUN_ERROR && "message" in event)
          runError = String(event.message);
      },
      error: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      complete: () => {
        clearTimeout(timeout);
        resolve();
      },
    });
  });
  if (runError) throw new Error(runError);
  return text;
}

/**
 * Generates a title for a conversation from its first exchange, using the
 * model that thread resolves to. Throws when the model is unreachable or
 * returns nothing usable; callers fall back to fallbackTitle.
 */
export async function generateThreadTitle(
  models: ModelSettingsService,
  owner: string,
  threadId: string,
  exchange: { user: string; assistant: string },
  runModel: TitleModelRunner = runTitleModel,
): Promise<string> {
  const excerpt = [
    exchange.user ? `User: ${exchange.user.slice(0, 1500)}` : "",
    exchange.assistant ? `Assistant: ${exchange.assistant.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!excerpt) throw new Error("Nothing to title yet");
  const resolved = await models.resolve(owner, threadId);
  const raw = await runModel(
    resolved.spec,
    resolved.baseUrl,
    `Write a title of 3 to 7 words for the conversation below. Plain words only: no quotes and no ending punctuation.\n\n${excerpt}`,
  );
  const title = cleanGeneratedTitle(raw);
  if (!title) throw new Error("The model returned an empty title");
  return title;
}
