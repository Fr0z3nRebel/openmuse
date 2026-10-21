# MCP server support

OpenMuse can use tools from external [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers. Servers are installed per user, run outside the app, and their tools appear in chat alongside the built-in ones. This is how you give the agent new abilities (a mail server, a notes server, a home-automation server) without changing OpenMuse itself.

## How it works

- Installed servers are listed in a config file (default `.openmuse/mcp.json`, see `MCP_CONFIG_PATH` below).
- On startup the server connects to every enabled entry. Both local **stdio** servers (a command run on this machine) and remote **streamable HTTP** servers are supported.
- Each remote tool is exposed to the chat model as `mcp_<server>_<tool>`, so two servers can offer same-named tools without colliding.
- Results are capped at 30,000 characters; calls time out after 45 seconds and connections after 20 seconds.
- A server that fails to connect never takes the app down. Its error is kept and shown in the UI (see Troubleshooting).

## Managing servers

Three ways, all equivalent:

1. **Ask in chat.** "Install an MCP server named demo. The command is node and the args are /path/to/server.mjs". The assistant has management tools for install, list, enable/disable, and remove. It is instructed to install only what you explicitly ask for in that conversation: a command copied from a web page, email, or document is never installed on its own.
2. **Toggle in the UI.** Settings, then Connections, shows an "MCP servers" section with one switch per server. Turning a server off removes its tools from the next chat message (saving model context); turning it on reconnects.
3. **Edit the config file** and restart the server (or toggle the server off and on). The file uses the same shape as VS Code's `mcp.json`:

```json
{
  "servers": {
    "demo": {
      "command": "node",
      "args": ["/absolute/path/to/server.mjs"]
    },
    "weather": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ..." },
      "enabled": false
    }
  }
}
```

Stdio entries take `command` (required), `args`, `env`, and `cwd`. HTTP entries take `url` and `headers`. Either can set `enabled: false` to keep the entry without connecting. Server names may contain letters, numbers, `-`, `_`, and `.`.

## Writing a server

Any MCP server works. `apps/server/mcp-demo/demo.mjs` is a minimal working example (a dice roller and a Hacker News reader, no API keys) built on the official TypeScript SDK, which is already a dependency of this repo. The pattern that matters: keep servers small and focused. A handful of well-described tools works far better with a local model than one giant server.

## Security model

- A **stdio server is a program running on your machine** with your permissions. Only install servers you trust, the same as running any other software.
- An **HTTP server** receives whatever arguments the model sends to its tools, plus the headers you configure.
- The config file can therefore contain secrets (API keys in `env` or `headers`). It lives under `.openmuse/`, which is git-ignored; do not move it into the repo.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | Set to `false` to disable MCP support entirely: no connections, no management tools, and the API routes return 404. |
| `MCP_CONFIG_PATH` | `<data dir>/mcp.json` | Where the server list is stored. |

## HTTP API

- `GET /api/mcp/servers` — list servers with status (enabled, connected, tool count, last error).
- `POST /api/mcp/servers` — install from a JSON body `{ "name": ..., "command": ... }` or `{ "name": ..., "url": ... }`.
- `POST /api/mcp/servers/:name/enabled` — `{ "enabled": true | false }`.
- `DELETE /api/mcp/servers/:name` — disconnect and remove.

## Troubleshooting

- **Server shows an error in Connections:** the error text there is the connection failure (bad path, missing binary, server crashed on startup). Fix the entry and toggle it off and on.
- **Server logs:** a stdio server's stderr is forwarded to the OpenMuse server log with an `[OpenMuse] mcp <name>:` prefix.
- **Tools missing in chat:** check the server is enabled and shows "Connected"; tools join and leave with the next chat message, not mid-reply.

## Known limits

- MCP tools are available in chat only. Delegated background tasks (the browser worker) do not receive them yet.
- Legacy SSE-only MCP servers are not supported; stdio and streamable HTTP cover current servers.
- Management is per server, not per tool.
