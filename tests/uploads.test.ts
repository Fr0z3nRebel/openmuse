import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { UploadsService } from "../apps/server/src/uploads.ts";

async function makeService(limitBytes: number) {
  const root = await mkdtemp(join(tmpdir(), "openmuse-uploads-"));
  const service = new UploadsService({ dataDir: root, uploadsLimitBytes: limitBytes } as never);
  return { root, service };
}

test("saves a file inside the uploads folder and reports usage", async (t) => {
  const { root, service } = await makeService(1024);
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await service.save("hello.txt", new TextEncoder().encode("hello"));
  assert.equal(result.file.name, "hello.txt");
  assert.equal(result.file.path, join(service.dir, "hello.txt"));
  assert.equal(result.usageBytes, 5);
  assert.equal(result.warning, false);
  assert.equal(await readFile(result.file.path, "utf8"), "hello");
  const status = await service.status();
  assert.deepEqual(
    status.files.map((file) => file.name),
    ["hello.txt"],
  );
});

test("rejects an upload that would push the folder over its limit", async (t) => {
  const { root, service } = await makeService(10);
  t.after(() => rm(root, { recursive: true, force: true }));
  await service.save("a.bin", new Uint8Array(8));
  await assert.rejects(service.save("b.bin", new Uint8Array(3)), /Uploads are full/);
  const status = await service.status();
  assert.equal(status.usageBytes, 8);
  assert.deepEqual(
    status.files.map((file) => file.name),
    ["a.bin"],
  );
});

test("flags the warning at 75 percent of the limit", async (t) => {
  const { root, service } = await makeService(100);
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = await service.save("a.bin", new Uint8Array(74));
  assert.equal(before.warning, false);
  const after = await service.save("b.bin", new Uint8Array(1));
  assert.equal(after.usageBytes, 75);
  assert.equal(after.warning, true);
});

test("suffixes a duplicate name instead of overwriting", async (t) => {
  const { root, service } = await makeService(1024);
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await service.save("photo.png", new Uint8Array(3));
  const second = await service.save("photo.png", new Uint8Array(4));
  assert.equal(first.file.name, "photo.png");
  assert.equal(second.file.name, "photo (2).png");
  assert.equal((await service.status()).files.length, 2);
});

test("stores traversal names as plain files inside the folder", async (t) => {
  const { root, service } = await makeService(1024);
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await service.save("../../evil.txt", new Uint8Array(2));
  assert.equal(result.file.name, "evil.txt");
  assert.equal(result.file.path, join(service.dir, "evil.txt"));
});

test("remove and clear never touch files outside the uploads folder", async (t) => {
  const { root, service } = await makeService(1024);
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, "outside.txt");
  await writeFile(outside, "keep me");
  await service.save("one.txt", new Uint8Array(2));
  await service.save("two.txt", new Uint8Array(2));
  const afterRemove = await service.remove("one.txt");
  assert.deepEqual(
    afterRemove.files.map((file) => file.name),
    ["two.txt"],
  );
  await service.remove("../outside.txt");
  assert.equal(await readFile(outside, "utf8"), "keep me");
  const afterClear = await service.clear();
  assert.equal(afterClear.files.length, 0);
  assert.equal(afterClear.usageBytes, 0);
  assert.ok((await stat(outside)).isFile());
});
