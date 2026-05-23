import { describe, expect, test } from "vite-plus/test";
import { segmentTextWithAtomicImages } from "../src/editor.ts";
import { AttachmentStore } from "../src/store.ts";

const IMAGE = {
  originalPath: "/tmp/a.png",
  mimeType: "image/png" as const,
  data: "",
};

describe("segmentTextWithAtomicImages", () => {
  test("treats adjacent image placeholders as separate atomic segments", () => {
    const store = new AttachmentStore();
    const first = store.add(IMAGE);
    const second = store.add({ ...IMAGE, originalPath: "/tmp/b.png" });

    const segments = segmentTextWithAtomicImages(
      `${first.placeholder}${second.placeholder}`,
      store,
    );

    expect(segments.map((segment) => segment.segment)).toEqual([
      first.placeholder,
      second.placeholder,
    ]);
    expect(segments.map((segment) => segment.index)).toEqual([0, first.placeholder.length]);
  });

  test("makes image-looking placeholders atomic even before preview lookup", () => {
    const store = new AttachmentStore();
    const attachment = store.add(IMAGE);

    const segments = segmentTextWithAtomicImages(
      `x${attachment.placeholder} [#image 99]`,
      store,
    ).map((segment) => segment.segment);

    expect(segments).toContain(attachment.placeholder);
    expect(segments).toContain("[#image 99]");
  });

  test("preserves existing paste marker atomicity when ids are valid", () => {
    const store = new AttachmentStore();
    const segments = segmentTextWithAtomicImages("a[paste #1 +61 lines]b", store, new Set([1]));

    expect(segments.map((segment) => segment.segment)).toEqual(["a", "[paste #1 +61 lines]", "b"]);
  });
});
