import {
  getCellDimensions,
  Image,
  type Component,
  type ImageTheme,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { ImageAttachment } from "./types.ts";

function formatAttachmentLine(
  attachment: ImageAttachment,
  width: number,
  style: (text: string) => string,
): string {
  const maxWidth = Math.max(1, width);
  const line = style(`Attached ${attachment.placeholder} ${attachment.originalPath}`);
  return visibleWidth(line) > maxWidth ? truncateToWidth(line, maxWidth, "") : line;
}

export class ImagePreviewMessage implements Component {
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
    const safeWidth = Math.max(1, width);
    for (let index = 0; index < this.attachments.length; index++) {
      const attachment = this.attachments[index]!;
      lines.push(formatAttachmentLine(attachment, safeWidth, this.theme.fallbackColor));
      lines.push(...this.images[index]!.render(safeWidth));
    }
    return lines;
  }

  invalidate(): void {
    for (const image of this.images) image.invalidate();
  }
}

interface CursorPreviewTheme {
  title: (text: string) => string;
  muted: (text: string) => string;
  accent: (text: string) => string;
}

export class CursorImagePreviewWidget implements Component {
  private image: Image;

  constructor(
    private attachment: ImageAttachment,
    private readonly theme: CursorPreviewTheme,
  ) {
    this.image = this.createImage(attachment);
  }

  render(width: number): string[] {
    const imageWidth = this.constrainedImageWidth(width);
    this.image = this.createImage(this.attachment, imageWidth);
    return [this.headerLine(width), ...this.image.render(imageWidth + 2)];
  }

  invalidate(): void {
    this.image.invalidate();
  }

  private headerLine(width: number): string {
    return formatAttachmentLine(this.attachment, width, this.theme.title);
  }

  private createImage(attachment: ImageAttachment, maxWidthCells = 60): Image {
    return new Image(
      attachment.data,
      attachment.mimeType,
      { fallbackColor: this.theme.accent },
      {
        maxWidthCells,
        filename: attachment.placeholder,
      },
      attachment.dimensions,
    );
  }

  private constrainedImageWidth(width: number): number {
    const maxWidth = Math.max(1, Math.min(60, width - 2));
    const maxRows = 14;
    const dimensions = this.attachment.dimensions;
    if (!dimensions || dimensions.widthPx <= 0 || dimensions.heightPx <= 0) return maxWidth;

    const cell = getCellDimensions();
    const widthForMaxRows = Math.floor(
      (maxRows * cell.heightPx * dimensions.widthPx) / (dimensions.heightPx * cell.widthPx),
    );
    return Math.max(1, Math.min(maxWidth, widthForMaxRows));
  }
}
