import type { ImageDimensions } from "@earendil-works/pi-tui";

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

export interface PasterPreviewDetails {
  placeholders: string[];
}
