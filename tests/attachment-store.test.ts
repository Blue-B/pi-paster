import { describe, expect, test } from "vite-plus/test";
import { AttachmentStore } from "../src/index.ts";

describe("AttachmentStore", () => {
  test("allocates placeholders in insertion order", () => {
    const store = new AttachmentStore();

    const first = store.add({
      originalPath: "/tmp/a.png",
      mimeType: "image/png",
      data: "aaa",
    });
    const second = store.add({
      originalPath: "/tmp/b.jpg",
      mimeType: "image/jpeg",
      data: "bbb",
    });

    expect(first.placeholder).toBe("[#image 1]");
    expect(second.placeholder).toBe("[#image 2]");
    expect(store.list().map((attachment) => attachment.placeholder)).toEqual([
      "[#image 1]",
      "[#image 2]",
    ]);
  });

  test("returns referenced attachments by first placeholder occurrence", () => {
    const store = new AttachmentStore();
    store.add({ originalPath: "/tmp/a.png", mimeType: "image/png", data: "aaa" });
    store.add({ originalPath: "/tmp/b.webp", mimeType: "image/webp", data: "bbb" });

    const matches = store.matchingPlaceholders(
      "compare [#image 2] with [#image 1] and [#image 2] again",
    );

    expect(matches.map((attachment) => attachment.placeholder)).toEqual([
      "[#image 2]",
      "[#image 1]",
    ]);
  });

  test("clear resets pending attachments and ids", () => {
    const store = new AttachmentStore();
    store.add({ originalPath: "/tmp/a.gif", mimeType: "image/gif", data: "aaa" });

    store.clear();

    expect(store.list()).toEqual([]);
    expect(
      store.add({ originalPath: "/tmp/b.png", mimeType: "image/png", data: "bbb" }).placeholder,
    ).toBe("[#image 1]");
  });
});
