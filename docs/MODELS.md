# Choosing a model

OpenMuse chats run on the model you choose. There is a global default, and any
chat can override it.

## Where to set it

- **Settings → Connections → Model**: the Ollama host and port, the connection
  status, and the default model picked from what Ollama has installed. New
  chats start with the default.
- **In a chat**: the model chip above the composer shows the model this chat is
  using. Tap it to switch this chat to any installed model, or back to the
  default. The switch applies to the **next message**; there is nothing to
  restart.

## What switching does to a conversation

A model remembers nothing between messages. The app stores the conversation
transcript and sends it in full on every turn, so switching models keeps the
history exactly as it is: the new model simply reads the same transcript on the
next turn.

One thing to watch: context windows differ. If a long conversation is switched
to a model whose window cannot hold the transcript, the earliest part may be
cut off by the model server. The picker shows each model's context size and
warns when a chat looks too long for the model you picked. The warning never
blocks the switch.

## Providers

Models are named as `provider/model` specs, and the agent adapter already
routes `openai/`, `anthropic/`, and `google/` (Gemini) specs, each with its own
base URL and key from the server environment. Most other hosted and local
servers (OpenRouter, Groq, LM Studio, llama.cpp, and similar) speak the OpenAI
dialect and ride the `openai/` route.

The settings UI manages **Ollama** today: the settings record carries a
provider field and the resolution logic is provider-aware, so another provider
can become a first-class settings citizen later without changing stored data
or the chat picker.

## Environment seeding

On first run, settings are derived from the server environment: `MODEL`
(stripping an `openai/` prefix) becomes the default model, and the host and
port come from `OPENAI_BASE_URL`. Once you save in Settings, the saved values
win and the environment values are only the fallback seed.

## API

- `GET /api/settings/model` — the saved (or seeded) global model settings.
- `PUT /api/settings/model` — save `{ ollamaHost, ollamaPort, defaultModel }`.
- `GET /api/models` — models installed on the configured Ollama, each with its
  context length when Ollama reports one, plus the default spec. When Ollama
  is unreachable the list is empty and `error` explains where it tried.
- `GET /api/threads/:threadId/model` — the model a chat will use, and whether
  it comes from the thread override or the default.
- `PUT /api/threads/:threadId/model` — `{ model: "openai/<name>" }` to override
  this chat, or `{ model: null }` to return it to the default.

## Scope note

The picker governs chat. Delegated background tasks (the durable worker) keep
using the model from the server environment (`MODEL`) in this version.
