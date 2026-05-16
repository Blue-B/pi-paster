import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PasterEditor } from "./editor.ts";
import { imagesForText } from "./image-utils.ts";
import { CursorImagePreviewWidget, ImagePreviewMessage } from "./preview.ts";
import { AttachmentStore } from "./store.ts";
import type { PasterPreviewDetails } from "./types.ts";

export * from "./editor.ts";
export * from "./image-utils.ts";
export * from "./preview.ts";
export * from "./store.ts";
export * from "./terminal-input.ts";
export * from "./types.ts";

export default function paster(pi: ExtensionAPI): void {
  const store = new AttachmentStore();
  let pendingPreview = [] as ReturnType<AttachmentStore["matchingPlaceholders"]>;
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
          setCursorPreview: (attachment) => {
            ctx.ui.setWidget(
              "paster-cursor-preview",
              attachment
                ? (_tui, widgetTheme) =>
                    new CursorImagePreviewWidget(attachment, {
                      title: (text) => widgetTheme.fg("accent", text),
                      muted: (text) => widgetTheme.fg("muted", text),
                      accent: (text) => widgetTheme.fg("accent", text),
                    })
                : undefined,
              { placement: "aboveEditor" },
            );
          },
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
