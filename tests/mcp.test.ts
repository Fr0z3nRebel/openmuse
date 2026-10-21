import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { McpService } from "../apps/server/src/mcp.ts";

const demoScript = resolve("apps/server/mcp-demo/demo.mjs");

async function makeService() {
  const root = await mkdtemp(join(tmpdir(), "openmuse-mcp-"));
  const service = new McpService({
    dataDir: root,
    mcpConfigPath: join(root, "mcp.json"),
  } as never);
  return { root, service };
}

test("mcp service installs, calls, toggles and removes a stdio server", async () => {
  const { root, service } = await makeService();
  try {
    const installed = await service.install({ name: "demo", command: "node", args: [demoScript] });
    assert.equal(installed.connected, true);
    assert.equal(installed.tools.length, 2);

    const saved = JSON.parse(await readFile(join(root, "mcp.json"), "utf8")) as {
      servers: Record<string, unknown>;
    };
    assert.ok(saved.servers.demo);

    const tools = service.tools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "mcp_demo_dice_roll",
      "mcp_demo_hacker_news_top",
    ]);
    const dice = tools.find((tool) => tool.name === "mcp_demo_dice_roll");
    assert.ok(dice);
    const execute = dice.execute as unknown as (
      args: Record<string, unknown>,
      context?: unknown,
    ) => Promise<unknown>;
    const rolled = await execute({ count: 2, sides: 6 }, undefined);
    assert.match(JSON.stringify(rolled), /Rolled 2d6/);

    const off = await service.setEnabled("demo", false);
    assert.equal(off?.enabled, false);
    assert.equal(service.tools().length, 0);

    const on = await service.setEnabled("demo", true);
    assert.equal(on?.connected, true);
    assert.equal(service.tools().length, 2);

    await service.remove("demo");
    assert.equal(service.list().length, 0);
    assert.equal(service.tools().length, 0);
  } finally {
    await service.closeAll();
    await rm(root, { recursive: true, force: true });
  }
});

test("mcp service reports a bad command instead of throwing", async () => {
  const { root, service } = await makeService();
  try {
    const status = await service.install({
      name: "broken",
      command: "openmuse-no-such-binary",
      args: [],
    });
    assert.equal(status.connected, false);
    assert.ok(status.error);
    assert.equal(service.tools().length, 0);
  } finally {
    await service.closeAll();
    await rm(root, { recursive: true, force: true });
  }
});
