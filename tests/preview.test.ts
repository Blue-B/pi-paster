import { describe, expect, test } from "vite-plus/test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { CursorImagePreviewWidget, ImagePreviewMessage } from "../src/index.ts";
import type { ImageAttachment } from "../src/types.ts";

const attachment: ImageAttachment = {
  id: 1,
  placeholder: "[#image 1]",
  originalPath: `/tmp/${"very-long-directory-name/".repeat(12)}image-with-a-long-name.png`,
  mimeType: "image/png",
  data: "aaa",
  createdAt: 0,
};

describe("preview rendering", () => {
  test("truncates submitted attachment labels to the available width", () => {
    const message = new ImagePreviewMessage([attachment], {
      fallbackColor: (text) => `\u001b[2m${text}\u001b[0m`,
    });

    const [label] = message.render(40);

    expect(visibleWidth(label!)).toBeLessThanOrEqual(40);
  });

  test("truncates cursor preview labels to the available width", () => {
    const widget = new CursorImagePreviewWidget(attachment, {
      title: (text) => `\u001b[1m${text}\u001b[0m`,
      muted: (text) => text,
      accent: (text) => text,
    });

    const [label] = widget.render(40);

    expect(visibleWidth(label!)).toBeLessThanOrEqual(40);
  });
});
