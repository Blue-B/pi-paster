# Pi Image Paste Attachments Extension

## Goal

Create a pi extension that makes pasted or drag-dropped image paths behave like first-class image attachments in interactive mode.

Today, pi can read image files when the assistant/tool explicitly calls `read`, and `Ctrl+V` on an image clipboard saves the clipboard image to a temp file and inserts that temp path into the editor. The desired UX is more direct:

1. User pastes or drag-drops an image path, or uses pi's image clipboard paste flow.
2. The editor replaces the raw file path with a readable placeholder such as `[#image1]`.
3. The extension stores the corresponding image data immediately.
4. On submit, the LLM receives the user's text first, with placeholders preserved, followed by the attached image blocks. The assistant should not need to call `read` just to see the image.

## Non-goals for MVP

- No image description/captioning model yet.
- No file browser or attachment picker.
- No editing UI beyond visible placeholder text in the normal editor.
- No permanent attachment storage across pi restarts.
- No changes to pi core unless extension APIs prove insufficient.

## UX

### Paste or drag-drop image path

User action:

```text
Here is the bug /var/folders/.../pi-clipboard-abc.png
```

Editor should become:

```text
Here is the bug [#image1]
```

A path-only paste must also be handled as a first-class case:

```text
/var/folders/.../pi-clipboard-abc.png
```

Editor should become:

```text
[#image1]
```

This path-only behavior is important because terminal drag-and-drop commonly inserts only the dropped file path. If that single pasted/dropped token is an image path, the extension should consume it, store the image payload, and insert only the placeholder.

Placeholder format:

- Use `[#image1]`, `[#image2]`, etc.
- No space inside the token. This makes placeholders easy to scan, easy to match exactly, and unlikely to conflict with normal prose.
- The number is allocated when the image is accepted into attachment state.

The extension records:

- placeholder: `[#image1]`
- original path: `/var/folders/.../pi-clipboard-abc.png`
- mime type: `image/png`
- base64 image payload
- optional size/dimensions metadata if easy to compute

### Multiple images

If a paste contains multiple image paths:

```text
/Users/me/a.png /Users/me/b.jpg
```

Editor should insert:

```text
[#image1] [#image2]
```

### Mixed paste

If a paste contains text and image paths, only image path tokens are replaced:

```text
compare /tmp/before.png with /tmp/after.png please
```

becomes:

```text
compare [#image1] with [#image2] please
```

### Submit behavior

When the user submits:

```text
What's wrong here? [#image1]
```

The extension should submit a single user message whose content order is equivalent to:

1. Text block: `What's wrong here? [#image1]`
2. Image block for `[#image1]`

This keeps the user's placeholder references in the prompt while attaching the actual image payload to the same turn.

## Technical design

### Extension APIs to use

Relevant pi extension APIs from the docs:

- `ctx.ui.setEditorComponent(...)` to install a custom editor.
- `CustomEditor` to preserve app-level keybindings and default editor behavior.
- `ctx.ui.getEditorComponent()` to detect/wrap a previously configured editor where possible.
- `pi.on("input", ...)` to transform submitted input and attach images.
- `event.images` / transformed `images` for attached image blocks.
- `ctx.ui.notify(...)` for non-blocking warnings.

### Editor interception

Implement an `ImageAttachmentEditor extends CustomEditor`.

Responsibilities:

1. Intercept bracketed paste input before default paste handling.
2. Parse pasted content into tokens, preserving non-image text.
3. For each candidate image path:
   - resolve shell quoting/escaping,
   - verify the file exists,
   - detect supported image MIME type,
   - read and store the image payload,
   - insert a placeholder instead of the raw path.
4. Fall back to `super.handleInput(data)` for all non-image paste/input.

Important implementation note: `Editor.handlePaste()` is private in the pi-tui TypeScript declarations, so the extension should not override it directly. Instead, intercept bracketed paste sequences in `handleInput()` before delegating to `super.handleInput()`.

### Support pi's existing Ctrl+V image clipboard flow

Pi's existing image clipboard handler saves clipboard images to a temp file and calls `editor.insertTextAtCursor(filePath)`.

To convert that flow into placeholders too, override `insertTextAtCursor(text)` in `ImageAttachmentEditor`:

- If `text` is a recognized image path, read/store it and insert `[#imageN]`.
- Otherwise delegate to `super.insertTextAtCursor(text)`.

This lets the extension reuse pi's current clipboard-to-temp-file mechanism without reimplementing native clipboard image access.

### Attachment state

Maintain in-memory attachment state in the extension runtime:

```ts
interface ImageAttachment {
  id: number;
  placeholder: string; // e.g. "[#image1]"
  originalPath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string; // base64
  createdAt: number;
}
```

State rules:

- IDs increment per session/runtime.
- Keep attachments even if placeholders are later deleted; only submit attachments whose placeholder still appears in the submitted text.
- Attach each placeholder at most once per submitted message, ordered by first occurrence in the text.
- Clear attachment state on `/new`, `/resume`, `/fork`, or extension reload via `session_start`/`session_shutdown` lifecycle.

### Input transformation

Register an `input` handler:

1. Ignore `event.source === "extension"` to avoid recursion.
2. Scan `event.text` for known placeholders.
3. Build `images` from matching attachment payloads.
4. Return:

```ts
return {
  action: "transform",
  text: event.text,
  images: [...(event.images ?? []), ...matchedImages],
};
```

If no placeholders are found, return `continue`.

### Detection and parsing

The parser must explicitly support path-only paste/drop content. If the complete pasted input is a single image path, possibly quoted or shell-escaped, it should be replaced by one placeholder and should not fall back to default paste behavior. This is the primary drag-and-drop path for many terminals.

Supported image formats for MVP:

- PNG
- JPEG
- WebP
- GIF

Path parsing should handle:

- absolute paths: `/tmp/a.png`
- home paths: `~/Desktop/a.png`
- relative paths: `./a.png`
- shell-escaped spaces: `/Users/me/Desktop/My\ Image.png`
- quoted paths: `'/Users/me/My Image.png'`, `"/Users/me/My Image.png"`
- multiple paths separated by whitespace or newlines

MIME detection should use magic bytes, not only file extension. Extension-only implementation can keep this small:

- PNG: `89 50 4E 47 0D 0A 1A 0A`
- JPEG: `FF D8 FF`
- GIF: `GIF87a` or `GIF89a`
- WebP: `RIFF....WEBP`

### Image size handling

MVP can attach original base64 data, but should include a conservative max file size guard to avoid accidental huge context/provider payloads.

Suggested defaults:

- Max image file size: 10 MB.
- If over limit: leave path unchanged and show a warning.

Future improvement: use pi's internal image resize logic if it becomes exported/stable, or add a dependency such as `sharp`/`jimp` in the extension package.

## Open question: same user message vs additional user messages

The preferred MVP is a single user message containing:

- one text block with placeholders,
- then image blocks in placeholder order.

This is simpler and avoids multiple turns. `pi.sendUserMessage()` always triggers a turn, so creating separate user messages for each image would likely cause unwanted agent execution unless pi exposes a batch append/send API.

If we later need visually separate image messages, investigate whether `input` handling can return `handled` and manually append entries without triggering multiple turns. That is not part of MVP.

## Edge cases

- Placeholder deleted before submit: do not attach that image.
- Placeholder copied/duplicated: attach once; text can refer to it multiple times.
- User manually types `[#image1]`: attach only if it matches existing attachment state.
- File deleted after paste: not a problem if image payload was read immediately.
- Paste is not an image path: preserve default pi paste behavior.
- Unsupported image file: leave text unchanged and optionally notify.
- Busy/streaming state: input transform should work for queued steer/follow-up messages too, because images are part of the transformed prompt.
- Non-interactive modes: extension should no-op custom editor setup when `ctx.hasUI` is false; input transform may still work for text containing known placeholders only within the same runtime.

## Commands and tools

No slash commands or LLM-callable tools for the MVP. The extension should work automatically from paste/edit/submit behavior. Debugging helpers can be reconsidered later, but they should not be part of the initial UX.

## Testing strategy

Use a layered test approach:

1. Unit tests for pure helpers:
   - placeholder allocation (`[#image1]`, `[#image2]`, ...),
   - placeholder matching and submit ordering,
   - path tokenization and shell unescaping,
   - path resolution for absolute, home, and relative paths,
   - MIME detection from magic bytes,
   - max file size rejection,
   - image loading to base64.
2. Editor-level tests where feasible:
   - path-only paste becomes one placeholder,
   - mixed text plus image paths preserves non-image text,
   - multiple image paths become multiple placeholders,
   - non-image paste delegates to default behavior.
3. Input-transform tests:
   - only placeholders still present in submitted text are attached,
   - duplicated placeholders attach once,
   - attachments are ordered by first placeholder occurrence,
   - existing `event.images` are preserved before extension-added images.
4. Manual TUI smoke tests for behavior that depends on pi's interactive editor or terminal integration:
   - Ctrl+V image clipboard on macOS,
   - dragging an image file from Finder into the terminal,
   - pasting a path with spaces,
   - deleting a placeholder before submit,
   - confirming Escape, Ctrl+C, Ctrl+D, Ctrl+P, Ctrl+L, and Enter still behave normally.

Run automated tests with `vp test run`; run formatting, linting, and type checks with `vp check`.

## Implementation plan

1. Implement the package extension entrypoint at `src/index.ts` (the package manifest already exposes it via `pi.extensions`).
2. Define attachment state and helpers:
   - path tokenization/unescaping,
   - path resolution,
   - MIME detection,
   - image loading to base64,
   - placeholder allocation.
3. Implement `ImageAttachmentEditor`:
   - intercept bracketed paste,
   - override `insertTextAtCursor`,
   - delegate to `super` for all other input.
4. Register editor component on `session_start` when `ctx.hasUI`.
5. Register `input` event transformer to attach images by placeholder order.
6. Manual test scenarios:
   - Ctrl+V image clipboard on macOS.
   - Drag image file from Finder into terminal.
   - Paste a normal image path.
   - Paste path with spaces.
   - Paste multiple images.
   - Delete placeholder before submit.
   - Submit while agent is streaming as steer/follow-up.

## API research notes for implementers

Use these references before re-researching pi/TUI internals:

- Extension docs: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
  - Input transform API is in the "Input Events" section.
  - Custom editor API examples are in the "Custom Editor" section.
  - `ctx.ui.getEditorComponent()`/`setEditorComponent()` wrapping examples are near the UI API examples.
- TUI docs: `/Users/beowulf/.vite-plus/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
  - Pattern 7 documents using `CustomEditor` while preserving app keybindings.
- Example custom editors:
  - `node_modules/@earendil-works/pi-coding-agent/examples/extensions/modal-editor.ts`
  - `node_modules/@earendil-works/pi-coding-agent/examples/extensions/rainbow-editor.ts`
- Runtime type declarations used during implementation:
  - `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/custom-editor.d.ts`
    - `CustomEditor` constructor: `(tui, theme, keybindings, options?)`.
    - Public hooks include `handleInput(data)` and `insertTextAtCursor(text)` via the base `Editor`.
  - `node_modules/@earendil-works/pi-tui/dist/components/editor.d.ts`
    - `Editor` exposes `getText()`, `getExpandedText()`, `setText()`, `insertTextAtCursor()`, and `handleInput()`.
    - `handlePaste()` is private; do not override it.
  - `node_modules/@earendil-works/pi-ai/dist/types.d.ts` (resolved through pnpm store if not directly symlinked)
    - `ImageContent` shape is `{ type: "image"; data: string; mimeType: string }`.
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
    - `InputEventResult` transform shape is `{ action: "transform"; text; images? }`.
- Bracketed paste details are visible in `node_modules/@earendil-works/pi-tui/dist/components/editor.js`:
  - Paste start: `\x1b[200~`.
  - Paste end: `\x1b[201~`.
  - The built-in editor buffers paste content and calls its private `handlePaste()`; this extension should intercept complete bracketed paste sequences in `CustomEditor.handleInput()` before delegating.
- Existing pi image clipboard flow is in `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js`:
  - It saves a clipboard image to a temp file, then calls `editor.insertTextAtCursor?.(filePath)`, so overriding `insertTextAtCursor()` is the public extension hook for that path.

## Acceptance criteria

- Pasting or drag-dropping an image path replaces it with `[#imageN]` in the editor.
- Ctrl+V image clipboard still works, but inserts `[#imageN]` instead of the temp path.
- Submitting a prompt with `[#imageN]` sends the actual image as an attachment in the same user turn.
- The assistant can answer image-content questions without first calling the `read` tool.
- Non-image pastes behave exactly like default pi.
- The extension does not break core app keybindings such as Escape, Ctrl+C, Ctrl+D, Ctrl+P, Ctrl+L, and Enter.
