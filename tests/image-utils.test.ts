import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  AttachmentStore,
  replaceImagePathsInText,
  tokenizePathLikeText,
} from "../src/index.ts";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe("replaceImagePathsInText with spaces", () => {
  let dir: string;
  let withSpace: string;
  let withMultiSpace: string;
  let plainPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paster-spaces-"));
    withSpace = join(dir, "Screen Shot.png");
    withMultiSpace = join(dir, "my   weird name.png");
    plainPath = join(dir, "plain.png");
    writeFileSync(withSpace, PNG_BYTES);
    writeFileSync(withMultiSpace, PNG_BYTES);
    writeFileSync(plainPath, PNG_BYTES);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("bare path with single space attaches and replaces full token", () => {
    const store = new AttachmentStore();
    const result = replaceImagePathsInText(withSpace, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.accepted).toHaveLength(1);
    expect(result.text).toBe("[#image 1]");
    expect(result.accepted[0]?.originalPath).toBe(withSpace);
  });

  test("bare path with multiple consecutive spaces still resolves", () => {
    const store = new AttachmentStore();
    const result = replaceImagePathsInText(withMultiSpace, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.text).toBe("[#image 1]");
    expect(result.accepted[0]?.originalPath).toBe(withMultiSpace);
  });

  test("path with space embedded in surrounding text replaces only the path", () => {
    const store = new AttachmentStore();
    const text = `look at ${withSpace} please`;
    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.text).toBe("look at [#image 1] please");
  });

  test("two space-containing paths separated by newline both attach", () => {
    const store = new AttachmentStore();
    const text = `${withSpace}\n${withMultiSpace}`;
    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(2);
    expect(result.text).toBe("[#image 1]\n[#image 2]");
  });

  test("non-existent bare path with space does not eat trailing words", () => {
    const store = new AttachmentStore();
    const ghost = join(dir, "does not exist.png");
    const text = `${ghost} hello world`;
    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(0);
    expect(result.text).toBe(text);
  });

  test("quoted path with space still works", () => {
    const store = new AttachmentStore();
    const text = `"${withSpace}"`;
    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.text).toBe("[#image 1]");
  });

  test("backslash-escaped space still works", () => {
    const store = new AttachmentStore();
    const escaped = withSpace.replace(/ /g, "\\ ");
    const result = replaceImagePathsInText(escaped, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.text).toBe("[#image 1]");
  });

  test("two adjacent bare paths separated by space do not merge", () => {
    const store = new AttachmentStore();
    const text = `${plainPath} ${plainPath}`;
    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(2);
    expect(result.text).toBe("[#image 1] [#image 2]");
  });

  test("macos screencapture-style mixed escaping (escaped + raw spaces)", () => {
    const store = new AttachmentStore();
    const a = join(dir, "Screenshot 2026-05-17 at 11.45.57 AM.png");
    const b = join(dir, "Screenshot 2026-05-17 at 11.46.13 AM.png");
    writeFileSync(a, PNG_BYTES);
    writeFileSync(b, PNG_BYTES);

    // Mimic real macOS paste: most spaces escaped with \ but space before "AM.png" raw.
    const escapeMost = (p: string) =>
      p.replace(/ (?=\d)/g, "\\ ").replace(/ (?=at)/g, "\\ ").replace(/ (?=\d\d:)/g, "\\ ");
    const text = `${escapeMost(a)} ${escapeMost(b)}`;

    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(2);
    expect(result.text).toBe("[#image 1] [#image 2]");
    expect(result.accepted.map((x) => x.originalPath)).toEqual([a, b]);
  });

  test("exact macos paste with newline + trailing user text", () => {
    const store = new AttachmentStore();
    const a = join(dir, "Screenshot 2026-05-17 at 11.48.52 AM.png");
    const b = join(dir, "Screenshot 2026-05-17 at 11.49.04 AM.png");
    writeFileSync(a, PNG_BYTES);
    writeFileSync(b, PNG_BYTES);

    const escape = (p: string) =>
      p.replace(/ (?=\d)/g, "\\ ").replace(/ (?=at)/g, "\\ ").replace(/ (?=\d\d:)/g, "\\ ");
    const text = `${escape(a)} \n${escape(b)} \nNot yet`;

    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(2);
    expect(result.text).toBe("[#image 1] \n[#image 2] \nNot yet");
  });

  test("macos screenshot path with NNBSP (U+202F) before AM/PM", () => {
    const store = new AttachmentStore();
    // macOS uses U+202F NARROW NO-BREAK SPACE between time and AM/PM
    const filename = `Screenshot 2026-05-17 at 12.03.02\u202FPM.png`;
    const real = join(dir, filename);
    writeFileSync(real, PNG_BYTES);

    // Paste form: \ before digits/at/HH:, NNBSP preserved before PM
    const text = real
      .replace(/ (?=\d)/g, "\\ ")
      .replace(/ (?=at)/g, "\\ ")
      .replace(/ (?=\d\d:)/g, "\\ ");

    const result = replaceImagePathsInText(text, { cwd: "/", store });

    expect(result.replaced).toBe(1);
    expect(result.text).toBe("[#image 1]");
    expect(result.accepted[0]?.originalPath).toBe(real);
  });
});

describe("tokenizePathLikeText", () => {
  test("emits bare flag for unquoted tokens and false for quoted", () => {
    const tokens = tokenizePathLikeText(`/a/b "/c/d" /e/f`);
    expect(tokens.map((t) => ({ value: t.value, bare: t.bare }))).toEqual([
      { value: "/a/b", bare: true },
      { value: "/c/d", bare: false },
      { value: "/e/f", bare: true },
    ]);
  });
});

describe("diagnostic notifications", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paster-diag-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("missing image path notifies user", () => {
    const store = new AttachmentStore();
    const messages: string[] = [];
    const ghost = join(dir, "ghost.png");
    replaceImagePathsInText(ghost, {
      cwd: "/",
      store,
      onReject: (r) => messages.push(r.reason),
    });
    expect(messages).toEqual(["missing"]);
  });

  test("non-image path token does not notify", () => {
    const store = new AttachmentStore();
    const messages: string[] = [];
    replaceImagePathsInText("/etc/hosts is fun", {
      cwd: "/",
      store,
      onReject: (r) => messages.push(r.reason),
    });
    expect(messages).toEqual([]);
  });

  test("unsupported file format notifies user", () => {
    const store = new AttachmentStore();
    const messages: string[] = [];
    const txt = join(dir, "note.png");
    writeFileSync(txt, Buffer.from("not actually a png"));
    replaceImagePathsInText(txt, {
      cwd: "/",
      store,
      onReject: (r) => messages.push(r.reason),
    });
    expect(messages).toEqual(["unsupported"]);
  });
});
