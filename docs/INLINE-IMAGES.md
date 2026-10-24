# Inline images in chat

Assistant messages render images inline instead of showing an `[Image: alt]`
text placeholder.

## What renders

- Markdown images (`![alt](url)`) render as an inline picture, capped at
  320 px wide and 420 px tall. A 4:3 box shows while the image loads; once
  loaded, the box takes the image's real aspect ratio.
- Links whose URL ends in an image extension (`.png`, `.jpg`, `.jpeg`,
  `.webp`, `.gif`, `.avif`, with an optional query string) render the same
  way. All other links render as normal text links.
- The alt text, when present, shows as a small caption under the image.

## Behavior

- Tapping or clicking an image opens the full-size version: a new tab on
  web, the system browser in the app.
- Only `http:` and `https:` URLs render (`isSafeAssistantUrl` in
  `assistant-markdown.ts`). Any other URL, and any image that fails to
  load, falls back to the `[Image: alt]` text label.

## Where

`apps/mobile/src/assistant-response.tsx`: the `image` and `link` render
rules plus the `InlineImage` component. It applies everywhere assistant
markdown is rendered.
