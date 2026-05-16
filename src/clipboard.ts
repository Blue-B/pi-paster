import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectImageMimeType, dimensionsForImage } from "./image-utils.ts";
import { MAX_IMAGE_BYTES, type LoadedImage } from "./types.ts";

export type ClipboardImageResult =
  | { ok: true; image: LoadedImage }
  | {
      ok: false;
      reason: "empty" | "unsupported-platform" | "too-large" | "unsupported" | "read-error";
    };

export function readClipboardImage(maxBytes = MAX_IMAGE_BYTES): ClipboardImageResult {
  if (process.platform !== "darwin") return { ok: false, reason: "unsupported-platform" };
  return readMacOSClipboardImage(maxBytes);
}

function readMacOSClipboardImage(maxBytes: number): ClipboardImageResult {
  const attempts = [
    { appleScriptClass: "PNGf", extension: "png" },
    { appleScriptClass: "JPEG", extension: "jpg" },
  ];

  for (const attempt of attempts) {
    const tmpFile = join(tmpdir(), `paster-clipboard-${randomUUID()}.${attempt.extension}`);
    try {
      const result = spawnSync(
        "osascript",
        [
          "-e",
          `set imageData to the clipboard as «class ${attempt.appleScriptClass}»`,
          "-e",
          `set outputFile to open for access POSIX file ${JSON.stringify(tmpFile)} with write permission`,
          "-e",
          "set eof of outputFile to 0",
          "-e",
          "write imageData to outputFile",
          "-e",
          "close access outputFile",
        ],
        { timeout: 3000, stdio: "ignore" },
      );
      if (result.status !== 0) continue;

      const bytes = readFileSync(tmpFile);
      if (bytes.length === 0) continue;
      if (bytes.length > maxBytes) return { ok: false, reason: "too-large" };

      const mimeType = detectImageMimeType(bytes);
      if (!mimeType) continue;

      const data = bytes.toString("base64");
      return {
        ok: true,
        image: {
          originalPath: `clipboard.${attempt.extension}`,
          mimeType,
          data,
          dimensions: dimensionsForImage(data, mimeType),
        },
      };
    } catch {
      return { ok: false, reason: "read-error" };
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  return { ok: false, reason: "empty" };
}
