import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, resolve } from "node:path";
import {
  CustomEditor,
  type ExtensionAPI,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  getImageDimensions,
  Image,
  type Component,
  type EditorTheme,
  type ImageDimensions,
  type ImageTheme,
  type OverlayHandle,
  truncateToWidth,
  type TUI,
  visibleWidth,
} from "@earendil-works/pi-tui";

export const EXTENSION_NAME = "paster";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface ImageAttachment {
  id: number;
  placeholder: string;
  originalPath: string;
  mimeType: SupportedImageMimeType;
  data: string;
  dimensions?: ImageDimensions;
  createdAt: number;
}

export interface LoadedImage {
  originalPath: string;
  mimeType: SupportedImageMimeType;
  data: string;
  dimensions?: ImageDimensions;
}

export interface PasterImageContent {
  type: "image";
  mimeType: string;
  data: string;
}

export type LoadImageResult =
  | { ok: true; image: LoadedImage }
  | {
      ok: false;
      reason: "missing" | "not-file" | "too-large" | "unsupported" | "read-error";
      path: string;
    };

export class AttachmentStore {
  private nextId = 1;
  private readonly attachments = new Map<string, ImageAttachment>();

  clear(): void {
    this.nextId = 1;
    this.attachments.clear();
  }

  list(): ImageAttachment[] {
    return [...this.attachments.values()].sort((a, b) => a.id - b.id);
  }

  add(input: Omit<ImageAttachment, "id" | "placeholder" | "createdAt">): ImageAttachment {
    const id = this.nextId++;
    const attachment: ImageAttachment = {
      ...input,
      id,
      placeholder: `[#image${id}]`,
      createdAt: Date.now(),
    };
    this.attachments.set(attachment.placeholder, attachment);
    return attachment;
  }

  get(placeholder: string): ImageAttachment | undefined {
    return this.attachments.get(placeholder);
  }

  matchingPlaceholders(text: string): ImageAttachment[] {
    const matches = this.list()
      .map((attachment) => ({ attachment, index: text.indexOf(attachment.placeholder) }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index);

    return matches.map((match) => match.attachment);
  }
}

interface PathToken {
  raw: string;
  value: string;
  start: number;
  end: number;
}

export function detectImageMimeType(bytes: Uint8Array): SupportedImageMimeType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export function resolveImagePath(input: string, cwd: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  if (isAbsolute(input)) return input;
  return resolve(cwd, input);
}

export function shellUnescape(input: string): string {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (char === "\\" && i + 1 < input.length) {
      result += input[++i]!;
    } else {
      result += char;
    }
  }
  return result;
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value === "~" ||
    value.startsWith("./") ||
    value.startsWith("../")
  );
}

export function tokenizePathLikeText(text: string): PathToken[] {
  const tokens: PathToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    const start = index;
    if (char === "'" || char === '"') {
      const quote = char;
      index++;
      let value = "";
      let closed = false;
      while (index < text.length) {
        const current = text[index]!;
        if (current === "\\" && quote === '"' && index + 1 < text.length) {
          value += text[index + 1]!;
          index += 2;
          continue;
        }
        if (current === quote) {
          index++;
          closed = true;
          break;
        }
        value += current;
        index++;
      }
      if (closed && isPathLike(value))
        tokens.push({ raw: text.slice(start, index), value, start, end: index });
      continue;
    }

    let rawValue = "";
    while (index < text.length) {
      const current = text[index]!;
      if (/\s/.test(current)) break;
      if (current === "\\" && index + 1 < text.length) {
        rawValue += current + text[index + 1]!;
        index += 2;
        continue;
      }
      rawValue += current;
      index++;
    }
    const value = shellUnescape(rawValue);
    if (isPathLike(value)) tokens.push({ raw: rawValue, value, start, end: index });
  }

  return tokens;
}

export function loadImageFromPath(
  inputPath: string,
  cwd: string,
  maxBytes = MAX_IMAGE_BYTES,
): LoadImageResult {
  const path = resolveImagePath(inputPath, cwd);
  try {
    if (!existsSync(path)) return { ok: false, reason: "missing", path };
    const stat = statSync(path);
    if (!stat.isFile()) return { ok: false, reason: "not-file", path };
    if (stat.size > maxBytes) return { ok: false, reason: "too-large", path };

    const data = readFileSync(path);
    const mimeType = detectImageMimeType(data);
    if (!mimeType) return { ok: false, reason: "unsupported", path };

    const base64Data = data.toString("base64");
    return {
      ok: true,
      image: {
        originalPath: path,
        mimeType,
        data: base64Data,
        dimensions: getImageDimensions(base64Data, mimeType) ?? undefined,
      },
    };
  } catch {
    return { ok: false, reason: "read-error", path };
  }
}

export function replaceImagePathsInText(
  text: string,
  options: {
    cwd: string;
    store: AttachmentStore;
    loadImage?: (path: string, cwd: string) => LoadImageResult;
    onReject?: (result: Exclude<LoadImageResult, { ok: true }>) => void;
  },
): { text: string; replaced: number; accepted: ImageAttachment[] } {
  const tokens = tokenizePathLikeText(text);
  if (tokens.length === 0) return { text, replaced: 0, accepted: [] };

  let output = "";
  let cursor = 0;
  let replaced = 0;
  const accepted: ImageAttachment[] = [];
  const loadImage = options.loadImage ?? loadImageFromPath;

  for (const token of tokens) {
    const result = loadImage(token.value, options.cwd);
    if (!result.ok) {
      options.onReject?.(result);
      continue;
    }

    const attachment = options.store.add(result.image);
    accepted.push(attachment);
    output += text.slice(cursor, token.start) + attachment.placeholder;
    cursor = token.end;
    replaced++;
  }

  if (replaced === 0) return { text, replaced: 0, accepted: [] };
  output += text.slice(cursor);
  return { text: output, replaced, accepted };
}

export function imagesForText(
  store: AttachmentStore,
  text: string,
  existing: PasterImageContent[] = [],
): PasterImageContent[] {
  return [
    ...existing,
    ...store.matchingPlaceholders(text).map((attachment) => ({
      type: "image" as const,
      mimeType: attachment.mimeType,
      data: attachment.data,
    })),
  ];
}

interface PasterPreviewDetails {
  placeholders: string[];
}

class ImagePreviewMessage implements Component {
  private readonly images: Image[];

  constructor(
    private readonly attachments: ImageAttachment[],
    private readonly theme: ImageTheme,
  ) {
    this.images = attachments.map(
      (attachment) =>
        new Image(attachment.data, attachment.mimeType, theme, {
          maxWidthCells: 60,
          maxHeightCells: 16,
          filename: attachment.placeholder,
        }),
    );
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (let index = 0; index < this.attachments.length; index++) {
      lines.push(
        this.theme.fallbackColor(
          `Attached ${this.attachments[index]!.placeholder} (${this.attachments[index]!.mimeType})`,
        ),
      );
      lines.push(...this.images[index]!.render(width));
    }
    return lines;
  }

  invalidate(): void {
    for (const image of this.images) image.invalidate();
  }
}

interface TextPreviewTheme {
  border: (text: string) => string;
  title: (text: string) => string;
  muted: (text: string) => string;
  accent: (text: string) => string;
}

class CursorImagePreviewOverlay implements Component {
  constructor(
    private attachment: ImageAttachment,
    private readonly theme: TextPreviewTheme,
  ) {}

  setAttachment(attachment: ImageAttachment): void {
    this.attachment = attachment;
  }

  render(width: number): string[] {
    const innerWidth = Math.max(20, width - 2);
    const title = truncateToWidth(
      ` ${this.attachment.placeholder} ${basename(this.attachment.originalPath)} `,
      innerWidth,
      "",
    );
    const top = this.withBorderTitle(title, innerWidth);
    const bottom = this.theme.border(`╰${"─".repeat(innerWidth)}╯`);
    return [top, ...this.renderTextImage(innerWidth), bottom];
  }

  invalidate(): void {}

  private withBorderTitle(title: string, innerWidth: number): string {
    const titleWidth = visibleWidth(title);
    return (
      this.theme.border("╭") +
      this.theme.title(title) +
      this.theme.border(`${"─".repeat(Math.max(0, innerWidth - titleWidth))}╮`)
    );
  }

  private contentLine(text: string, innerWidth: number): string {
    const truncated = truncateToWidth(text, innerWidth, "…", true);
    return `${this.theme.border("│")}${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}${this.theme.border("│")}`;
  }

  private renderTextImage(innerWidth: number): string[] {
    const dimensions = this.attachment.dimensions;
    const maxArtWidth = Math.min(56, Math.max(10, innerWidth));
    const maxArtHeight = 16;
    const aspect =
      dimensions && dimensions.heightPx > 0 ? dimensions.widthPx / dimensions.heightPx : 1;
    const artWidth = Math.max(8, Math.min(maxArtWidth, Math.round(maxArtHeight * aspect * 2)));
    const artHeight = Math.max(
      4,
      Math.min(maxArtHeight, Math.round(artWidth / Math.max(0.5, aspect) / 2)),
    );
    const fillChars = ["░", "▒", "▓", "▒"];
    const art = Array.from({ length: artHeight }, (_, row) => {
      const fill = fillChars[row % fillChars.length]!;
      return fill.repeat(artWidth);
    });
    const padLeft = Math.max(0, Math.floor((innerWidth - artWidth) / 2));
    const padTop = 0;
    const padBottom = 0;
    return [
      ...Array.from({ length: padTop }, () => this.contentLine("", innerWidth)),
      ...art.map((line) =>
        this.contentLine(`${" ".repeat(padLeft)}${this.theme.accent(line)}`, innerWidth),
      ),
      ...Array.from({ length: padBottom }, () => this.contentLine("", innerWidth)),
    ];
  }
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const PLACEHOLDER_REGEX = /\[#image\d+\]/g;

interface EditorCursor {
  line: number;
  col: number;
}

interface PlaceholderAtCursor {
  attachment: ImageAttachment;
  line: number;
  start: number;
  end: number;
}

function findPlaceholderAtCursor(
  store: AttachmentStore,
  lines: string[],
  cursor: EditorCursor,
  mode: "hover" | "backspace" | "delete",
): PlaceholderAtCursor | undefined {
  const line = lines[cursor.line] ?? "";
  for (const match of line.matchAll(PLACEHOLDER_REGEX)) {
    const placeholder = match[0];
    const start = match.index;
    const end = start + placeholder.length;
    const attachment = store.get(placeholder);
    if (!attachment) continue;

    if (mode === "hover" && cursor.col >= start && cursor.col <= end) {
      return { attachment, line: cursor.line, start, end };
    }
    if (mode === "backspace" && cursor.col > start && cursor.col <= end) {
      return { attachment, line: cursor.line, start, end };
    }
    if (mode === "delete" && cursor.col >= start && cursor.col < end) {
      return { attachment, line: cursor.line, start, end };
    }
  }
  return undefined;
}

interface EditorStateAccess {
  state: { lines: string[]; cursorLine: number; cursorCol: number };
  pushUndoSnapshot?: () => void;
  setCursorCol?: (col: number) => void;
  lastAction?: unknown;
  historyIndex?: number;
}

class PasterEditor extends CustomEditor {
  private pasterPasteBuffer: string | undefined;
  private activePreviewPlaceholder: string | undefined;
  private previewOverlay: CursorImagePreviewOverlay | undefined;
  private previewOverlayHandle: OverlayHandle | undefined;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    private readonly pasterKeybindings: KeybindingsManager,
    private readonly pasterOptions: {
      cwd: string;
      store: AttachmentStore;
      notify: (message: string) => void;
    },
  ) {
    super(tui, theme, pasterKeybindings);
  }

  override insertTextAtCursor(text: string): void {
    const transformed = this.transform(text);
    super.insertTextAtCursor(transformed.replaced > 0 ? transformed.text : text);
    this.updateCursorPreview();
  }

  override handleInput(data: string): void {
    if (this.handleBracketedPaste(data)) return;
    if (this.handleAtomicPlaceholderDelete(data)) return;

    super.handleInput(data);
    this.updateCursorPreview();
  }

  private handleBracketedPaste(data: string): boolean {
    let prefix = "";
    const original = data;
    const wasBuffered = this.pasterPasteBuffer !== undefined;

    if (this.pasterPasteBuffer === undefined) {
      const start = data.indexOf(PASTE_START);
      if (start === -1) return false;
      prefix = data.slice(0, start);
      this.pasterPasteBuffer = data.slice(start + PASTE_START.length);
      if (!this.pasterPasteBuffer.includes(PASTE_END)) {
        if (prefix) super.handleInput(prefix);
        return true;
      }
    } else {
      this.pasterPasteBuffer += data;
      if (!this.pasterPasteBuffer.includes(PASTE_END)) return true;
    }

    const end = this.pasterPasteBuffer.indexOf(PASTE_END);
    const content = this.pasterPasteBuffer.slice(0, end);
    const remaining = this.pasterPasteBuffer.slice(end + PASTE_END.length);
    this.pasterPasteBuffer = undefined;

    const transformed = this.transform(content);
    if (transformed.replaced === 0) {
      super.handleInput(
        wasBuffered ? `${PASTE_START}${content}${PASTE_END}${remaining}` : original,
      );
      this.updateCursorPreview();
      return true;
    }

    if (prefix) super.handleInput(prefix);
    super.insertTextAtCursor(transformed.text);
    if (remaining) super.handleInput(remaining);
    this.updateCursorPreview();
    return true;
  }

  private handleAtomicPlaceholderDelete(data: string): boolean {
    const isBackspace = this.pasterKeybindings.matches(data, "tui.editor.deleteCharBackward");
    const isDelete = this.pasterKeybindings.matches(data, "tui.editor.deleteCharForward");
    if (!isBackspace && !isDelete) return false;
    if (isDelete && this.getText().length === 0) return false;

    const target = findPlaceholderAtCursor(
      this.pasterOptions.store,
      this.getLines(),
      this.getCursor(),
      isBackspace ? "backspace" : "delete",
    );
    if (!target) return false;

    this.deleteLineRange(target.line, target.start, target.end);
    this.updateCursorPreview();
    return true;
  }

  private deleteLineRange(lineIndex: number, start: number, end: number): void {
    const editor = this as unknown as EditorStateAccess;
    editor.pushUndoSnapshot?.();
    const line = editor.state.lines[lineIndex] ?? "";
    editor.state.lines[lineIndex] = line.slice(0, start) + line.slice(end);
    editor.state.cursorLine = lineIndex;
    if (editor.setCursorCol) {
      editor.setCursorCol(start);
    } else {
      editor.state.cursorCol = start;
    }
    editor.lastAction = null;
    editor.historyIndex = -1;
    this.onChange?.(this.getText());
    this.tui.requestRender();
  }

  private transform(text: string): { text: string; replaced: number; accepted: ImageAttachment[] } {
    return replaceImagePathsInText(text, {
      cwd: this.pasterOptions.cwd,
      store: this.pasterOptions.store,
      onReject: (result) => {
        if (result.reason === "too-large") {
          this.pasterOptions.notify(
            `paster: image is over 10 MB and was not attached: ${result.path}`,
          );
        }
      },
    });
  }

  clearCursorPreview(): void {
    this.activePreviewPlaceholder = undefined;
    this.previewOverlay = undefined;
    this.previewOverlayHandle?.hide();
    this.previewOverlayHandle = undefined;
    this.tui.requestRender();
  }

  private updateCursorPreview(): void {
    const target = findPlaceholderAtCursor(
      this.pasterOptions.store,
      this.getLines(),
      this.getCursor(),
      "hover",
    );
    const nextPlaceholder = target?.attachment.placeholder;
    if (nextPlaceholder === this.activePreviewPlaceholder) return;
    this.activePreviewPlaceholder = nextPlaceholder;

    if (!target) {
      this.clearCursorPreview();
      return;
    }

    if (this.previewOverlay) {
      this.previewOverlay.setAttachment(target.attachment);
      this.tui.requestRender();
      return;
    }

    this.previewOverlay = new CursorImagePreviewOverlay(target.attachment, {
      border: this.borderColor,
      title: (text) => text,
      muted: (text) => text,
      accent: (text) => text,
    });
    this.previewOverlayHandle = this.tui.showOverlay(this.previewOverlay, {
      anchor: "top-right",
      width: 64,
      maxHeight: "70%",
      margin: 1,
      nonCapturing: true,
      visible: (termWidth, termHeight) => termWidth >= 80 && termHeight >= 24,
    });
    this.tui.requestRender();
  }
}

export type TerminalInputResult = { consume?: boolean; data?: string } | undefined;

export function createImagePasteTerminalInputHandler(options: {
  cwd: string;
  store: AttachmentStore;
  notify?: (message: string) => void;
  onAccept?: (attachments: ImageAttachment[]) => void;
  loadImage?: (path: string, cwd: string) => LoadImageResult;
}): (data: string) => TerminalInputResult {
  let pasteBuffer: string | undefined;

  const transform = (text: string) =>
    replaceImagePathsInText(text, {
      cwd: options.cwd,
      store: options.store,
      loadImage: options.loadImage,
      onReject: (result) => {
        if (result.reason === "too-large") {
          options.notify?.(`paster: image is over 10 MB and was not attached: ${result.path}`);
        }
      },
    });

  return (data: string): TerminalInputResult => {
    let prefix = "";
    const wasBuffered = pasteBuffer !== undefined;
    if (pasteBuffer === undefined) {
      const start = data.indexOf(PASTE_START);
      if (start === -1) return undefined;

      prefix = data.slice(0, start);
      pasteBuffer = data.slice(start + PASTE_START.length);
      if (!pasteBuffer.includes(PASTE_END)) {
        return prefix ? { data: prefix } : { consume: true };
      }
    } else {
      pasteBuffer += data;
      if (!pasteBuffer.includes(PASTE_END)) return { consume: true };
    }

    const end = pasteBuffer.indexOf(PASTE_END);
    const content = pasteBuffer.slice(0, end);
    const remaining = pasteBuffer.slice(end + PASTE_END.length);
    pasteBuffer = undefined;

    const transformed = transform(content);
    if (transformed.replaced === 0) {
      return wasBuffered ? { data: `${PASTE_START}${content}${PASTE_END}${remaining}` } : undefined;
    }
    options.onAccept?.(transformed.accepted);
    return { data: `${prefix}${transformed.text}${remaining}` };
  };
}

export default function paster(pi: ExtensionAPI): void {
  const store = new AttachmentStore();
  let pendingPreview: ImageAttachment[] = [];
  let activeEditor: PasterEditor | undefined;

  pi.registerMessageRenderer<PasterPreviewDetails>("paster-preview", (message, _options, theme) => {
    const placeholders = message.details?.placeholders ?? [];
    const attachments = store
      .list()
      .filter((attachment) => placeholders.includes(attachment.placeholder));
    if (attachments.length === 0) return undefined;
    return new ImagePreviewMessage(attachments, {
      fallbackColor: (text) => theme.fg("muted", text),
    });
  });

  pi.on("session_start", (_event, ctx) => {
    store.clear();
    pendingPreview = [];
    if (ctx.hasUI) {
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        activeEditor = new PasterEditor(tui, theme, keybindings, {
          cwd: ctx.cwd,
          store,
          notify: (message) => ctx.ui.notify(message, "warning"),
        });
        return activeEditor;
      });
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    pendingPreview = [];
    if (ctx.hasUI) {
      activeEditor?.clearCursorPreview();
      activeEditor = undefined;
      ctx.ui.setEditorComponent(undefined);
    }
    store.clear();
  });

  pi.on("input", (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (ctx.hasUI) {
      activeEditor?.clearCursorPreview();
    }

    const attachments = store.matchingPlaceholders(event.text);
    if (attachments.length === 0) return { action: "continue" as const };
    pendingPreview = attachments;

    return {
      action: "transform" as const,
      text: event.text,
      images: imagesForText(store, event.text, event.images),
    };
  });

  pi.on("before_agent_start", () => {
    if (pendingPreview.length === 0) return;
    const placeholders = pendingPreview.map((attachment) => attachment.placeholder);
    pendingPreview = [];
    return {
      message: {
        customType: "paster-preview",
        content: "",
        display: true,
        details: { placeholders },
      },
    };
  });
}
