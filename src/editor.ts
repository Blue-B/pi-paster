import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { replaceImagePathsInText } from "./image-utils.ts";
import type { AttachmentStore } from "./store.ts";
import type { ImageAttachment } from "./types.ts";

export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";
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

    if (mode === "hover" && cursor.col >= start && cursor.col < end) {
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

export class PasterEditor extends CustomEditor {
  private pasterPasteBuffer: string | undefined;
  private activePreviewPlaceholder: string | undefined;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    private readonly pasterKeybindings: KeybindingsManager,
    private readonly pasterOptions: {
      cwd: string;
      store: AttachmentStore;
      notify: (message: string) => void;
      setCursorPreview: (attachment: ImageAttachment | undefined) => void;
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

  clearCursorPreview(): void {
    this.activePreviewPlaceholder = undefined;
    this.pasterOptions.setCursorPreview(undefined);
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
    this.pasterOptions.setCursorPreview(target?.attachment);
  }
}
