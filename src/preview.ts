import { basename } from "node:path";
import {
  getCellDimensions,
  Image,
  type Component,
  type ImageTheme,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { ImageAttachment } from "./types.ts";

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
    const title = `${this.attachment.placeholder} ${basename(this.attachment.originalPath)}`;
    return this.theme.title(truncateToWidth(title, Math.max(1, width), ""));
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
