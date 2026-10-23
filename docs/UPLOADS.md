# Chat file uploads

You can attach any file to a chat message. The file's bytes are uploaded to the
OpenMuse server and saved in `.openmuse/uploads`, and the message names the saved
copy with a line like `Attached file: /path/to/.openmuse/uploads/photo.png`. The
agent passes that exact path to tools that take a local file path (for example an
image path for a character-reference tool), and the path can be reused in later
messages because the file stays saved until you delete it.

Because the file travels to the server, attaching works the same from any device:
the web app on another computer, or the phone app. A path that only exists on the
device you are holding would not mean anything to tools running on the server, so
OpenMuse always works with its own saved copy.

## Ways to attach

- Tap the composer's **+** button and choose **Upload a file…** (a file dialog on
  the web, the document picker in the app).
- Drag and drop files onto the chat (web).
- Paste a copied file or image into the chat (web).

Attachments appear as chips above the composer; tap a chip to remove it before
sending. A message can be sent with attachments and no text.

## Storage limit and cleanup

The uploads folder is capped at **5 GB** total by default. Set
`UPLOADS_LIMIT_BYTES` on the server to change it.

- At **75%** of the cap, chat shows a notice after an upload and the Settings
  meter turns amber: time to clear space soon.
- An upload that would push the folder over the cap is **rejected**; nothing is
  partially saved.
- Cleanup lives in **Settings → Connections → Uploads**: a usage meter, the list
  of stored files with per-file delete, and a clear-all button (tap twice to
  confirm). Cleanup only ever touches `.openmuse/uploads`; the file you uploaded
  from is a separate original and is never affected.

There is no automatic deletion: reference files are often reused across days, so
files stay until you remove them.

## API

- `GET /api/uploads` — list files with total usage, the limit, and the warning flag.
- `POST /api/uploads` — multipart form field `file`; returns the saved file plus
  the updated status. `201` on success, `413` when the cap would be exceeded.
- `DELETE /api/uploads/:name` — delete one stored file.
- `DELETE /api/uploads` — delete every stored file.

Note: attaching names a path for tools. It does not by itself show the file's
contents to the model.
