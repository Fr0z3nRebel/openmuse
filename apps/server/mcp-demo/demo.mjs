// Demo MCP server for OpenMuse: two tiny tools, no API keys, nothing stored.
// Run over stdio:  node apps/server/mcp-demo/demo.mjs
// Protocol traffic uses stdout, so this file only ever logs to stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "openmuse-demo", version: "0.1.0" });

server.registerTool(
  "dice_roll",
  {
    description:
      "Roll dice and report each roll and the total. Use for any dice, random number or chance request.",
    inputSchema: {
      count: z.number().int().min(1).max(100).describe("How many dice to roll"),
      sides: z.number().int().min(2).max(1000).describe("How many sides each die has"),
    },
  },
  async ({ count, sides }) => {
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    return {
      content: [
        {
          type: "text",
          text: `Rolled ${count}d${sides}: ${rolls.join(", ")} (total ${total})`,
        },
      ],
    };
  },
);

server.registerTool(
  "hacker_news_top",
  {
    description:
      "Get the current top stories from Hacker News: title and link for each. Use when asked about Hacker News or tech headlines there.",
    inputSchema: {
      count: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("How many stories to return (default 10)"),
    },
  },
  async ({ count }) => {
    const wanted = count ?? 10;
    try {
      const ids = await (
        await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
      ).json();
      const items = await Promise.all(
        ids.slice(0, wanted).map(async (id) => {
          const item = await (
            await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          ).json();
          return item;
        }),
      );
      const lines = items
        .filter((item) => item?.title)
        .map((item, index) => `${index + 1}. ${item.title}${item.url ? ` — ${item.url}` : ""}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Could not reach Hacker News: ${error instanceof Error ? error.message : "unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  },
);

await server.connect(new StdioServerTransport());
console.error("openmuse-demo MCP server ready on stdio");
