# Side chat titles

Side chats that have never been named show as "Untitled conversation" in the
threads sheet. OpenMuse names them automatically once there is something to
name them from.

## How it works

- When a reply finishes in a side chat, the app checks whether that chat
  still has no name. The main chat is never auto-titled, and a name the user
  set (or an earlier auto-title) is never overwritten.
- The app sends the first user message and the first assistant reply to
  `POST /api/threads/:threadId/title`. The server asks the model that thread
  resolves to (see MODELS.md) for a 3 to 7 word title and cleans the answer:
  first line only, surrounding quotes removed, capped at 60 characters.
- If the model is unreachable or returns nothing usable, the app falls back
  to the first user message itself, cleaned the same way (attachment lines
  such as "Attached file: ..." are dropped, capped at 60 characters).
- Titling is cosmetic: every failure is silent, and a chat that is not in the
  thread list yet is simply retried after a later reply.

## Where the code lives

- Server: `apps/server/src/engine/thread-title.ts` (`generateThreadTitle`,
  `cleanGeneratedTitle`, `fallbackTitle`), route in `apps/server/src/app.ts`.
- App: `ensureThreadTitle` in `apps/mobile/src/chat.tsx`, triggered when a
  turn goes from running to idle; the rename goes through the same
  `renameThread` the threads sheet uses.
- Tests: `tests/thread-title.test.ts`.
