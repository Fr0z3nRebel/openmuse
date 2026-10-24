import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanGeneratedTitle,
  fallbackTitle,
  generateThreadTitle,
} from "../apps/server/src/engine/thread-title.ts";

test("cleanGeneratedTitle keeps the first line and strips quotes", () => {
  assert.equal(
    cleanGeneratedTitle('"Moon Photography Tips"\nignored second line'),
    "Moon Photography Tips",
  );
  assert.equal(cleanGeneratedTitle("  Spaced   out   title  "), "Spaced out title");
  assert.equal(cleanGeneratedTitle(""), "");
});

test("cleanGeneratedTitle caps the length", () => {
  assert.equal(cleanGeneratedTitle("a".repeat(80)).length, 60);
});

test("fallbackTitle uses the first message without attachment lines", () => {
  assert.equal(
    fallbackTitle("Plan my garden beds\n\nAttached file: /tmp/x.png"),
    "Plan my garden beds",
  );
  assert.equal(fallbackTitle("Attached documents: Notes (artifact ID: abc)"), "");
  assert.equal(fallbackTitle(""), "");
});

test("fallbackTitle truncates long messages", () => {
  const title = fallbackTitle("word ".repeat(30).trim());
  assert.ok(title.endsWith("…"));
  assert.ok(title.length <= 60);
});

const fakeModels = {
  resolve: async () => ({ spec: "openai/test-model", baseUrl: undefined }),
};

test("generateThreadTitle cleans the model output", async () => {
  const title = await generateThreadTitle(
    fakeModels as never,
    "owner",
    "thread-1",
    { user: "How do I photograph the moon?", assistant: "Use a tripod and a fast lens." },
    async (spec) => {
      assert.equal(spec, "openai/test-model");
      return '"Photographing the Moon"';
    },
  );
  assert.equal(title, "Photographing the Moon");
});

test("generateThreadTitle rejects an empty model title", async () => {
  await assert.rejects(
    generateThreadTitle(
      fakeModels as never,
      "owner",
      "thread-1",
      { user: "Hi", assistant: "" },
      async () => "  ",
    ),
  );
});

test("generateThreadTitle rejects an empty exchange", async () => {
  await assert.rejects(
    generateThreadTitle(
      fakeModels as never,
      "owner",
      "thread-1",
      { user: "", assistant: "" },
      async () => "A Title",
    ),
  );
});
