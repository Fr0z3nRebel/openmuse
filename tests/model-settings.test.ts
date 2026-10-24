import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { ModelSettingsService } from "../apps/server/src/model-settings.ts";

function makeStore() {
  const records = new Map<string, unknown>();
  const key = (owner: string, kind: string, id: string) => `${owner}/${kind}/${id}`;
  return {
    get: async (owner: string, kind: string, id: string) =>
      records.get(key(owner, kind, id)) ?? null,
    put: async (owner: string, kind: string, value: { id: string }) => {
      records.set(key(owner, kind, value.id), value);
      return value;
    },
    remove: async (owner: string, kind: string, id: string) => {
      records.delete(key(owner, kind, id));
    },
  };
}

function makeService(model?: string) {
  return new ModelSettingsService(makeStore() as never, { model } as never);
}

test("seeds settings from the environment model and base URL", async () => {
  const previous = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = "http://192.168.1.50:9999/v1";
  try {
    const settings = await makeService("openai/gemma4:31b-cloud").settings("owner");
    assert.equal(settings.provider, "ollama");
    assert.equal(settings.ollamaHost, "192.168.1.50");
    assert.equal(settings.ollamaPort, 9999);
    assert.equal(settings.defaultModel, "gemma4:31b-cloud");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
});

test("resolves the default model with the configured Ollama base URL", async () => {
  const service = makeService("openai/gemma4:31b-cloud");
  await service.save("owner", {
    ollamaHost: "10.0.0.9",
    ollamaPort: 1234,
    defaultModel: "qwen2.5:7b",
  });
  const resolved = await service.resolve("owner", "thread-1");
  assert.equal(resolved.spec, "openai/qwen2.5:7b");
  assert.equal(resolved.baseUrl, "http://10.0.0.9:1234/v1");
});

test("a thread override wins over the default and clearing restores it", async () => {
  const service = makeService("openai/gemma4:31b-cloud");
  const before = await service.threadModel("owner", "thread-1");
  assert.equal(before.source, "default");
  assert.equal(before.spec, "openai/gemma4:31b-cloud");
  await service.setThreadModel("owner", "thread-1", "openai/gemma4:26b");
  const during = await service.threadModel("owner", "thread-1");
  assert.equal(during.source, "thread");
  assert.equal(during.spec, "openai/gemma4:26b");
  assert.equal((await service.resolve("owner", "thread-1")).spec, "openai/gemma4:26b");
  await service.setThreadModel("owner", "thread-1", null);
  const after = await service.threadModel("owner", "thread-1");
  assert.equal(after.source, "default");
  assert.equal(after.spec, "openai/gemma4:31b-cloud");
});

test("rejects invalid settings", async () => {
  const service = makeService("openai/gemma4:31b-cloud");
  await assert.rejects(
    service.save("owner", { ollamaHost: "http://example", ollamaPort: 11434, defaultModel: "m" }),
    /host/,
  );
  await assert.rejects(
    service.save("owner", { ollamaHost: "127.0.0.1", ollamaPort: 0, defaultModel: "m" }),
    /port/,
  );
  await assert.rejects(
    service.save("owner", { ollamaHost: "127.0.0.1", ollamaPort: 11434, defaultModel: " " }),
    /default model/,
  );
});

test("a non-Ollama seed spec passes through without a base URL", async () => {
  const service = makeService("anthropic/claude-sonnet-4.5");
  const resolved = await service.resolve("owner", "thread-1");
  assert.equal(resolved.spec, "anthropic/claude-sonnet-4.5");
  assert.equal(resolved.baseUrl, undefined);
});

test("lists models from the configured Ollama with context sizes", async (t) => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags")
      response.end(JSON.stringify({ models: [{ name: "qwen2.5:7b" }, { name: "gemma4:26b" }] }));
    else if (request.url === "/api/show")
      response.end(JSON.stringify({ model_info: { "qwen2.context_length": 32768 } }));
    else response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const service = makeService("openai/gemma4:31b-cloud");
  await service.save("owner", {
    ollamaHost: "127.0.0.1",
    ollamaPort: address.port,
    defaultModel: "qwen2.5:7b",
  });
  const list = await service.listModels("owner");
  assert.equal(list.error, undefined);
  assert.equal(list.defaultSpec, "openai/qwen2.5:7b");
  assert.deepEqual(
    list.models.map((model) => model.name),
    ["qwen2.5:7b", "gemma4:26b"],
  );
  assert.equal(list.models[0]?.contextLength, 32768);
});

test("reports an unreachable Ollama instead of throwing", async () => {
  const service = makeService("openai/gemma4:31b-cloud");
  await service.save("owner", {
    ollamaHost: "127.0.0.1",
    ollamaPort: 1,
    defaultModel: "qwen2.5:7b",
  });
  const list = await service.listModels("owner");
  assert.deepEqual(list.models, []);
  assert.match(list.error ?? "", /Can't reach Ollama at 127\.0\.0\.1:1/);
});
