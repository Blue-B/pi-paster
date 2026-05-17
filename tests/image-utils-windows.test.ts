import { describe, expect, test } from "vite-plus/test";
import {
  isWindowsDrivePath,
  isWindowsUncPath,
  isWindowsLikePath,
  windowsToWslPath,
  tokenizePathLikeText,
} from "../src/image-utils.ts";

describe("Windows path detection", () => {
  test("recognizes drive-letter paths with backslash or slash", () => {
    expect(isWindowsDrivePath("C:\\Users\\root\\a.png")).toBe(true);
    expect(isWindowsDrivePath("c:/Users/root/a.png")).toBe(true);
    expect(isWindowsDrivePath("C:Users\\root\\a.png")).toBe(false);
    expect(isWindowsDrivePath("/usr/local/x")).toBe(false);
  });

  test("recognizes UNC paths", () => {
    expect(isWindowsUncPath("\\\\server\\share\\a.png")).toBe(true);
    expect(isWindowsUncPath("\\\\")).toBe(false);
    expect(isWindowsLikePath("\\\\server\\share")).toBe(true);
  });

  test("converts Windows drive path to WSL /mnt path", () => {
    expect(windowsToWslPath("C:\\Users\\root\\a.png")).toBe("/mnt/c/Users/root/a.png");
    expect(windowsToWslPath("D:/dir/file.png")).toBe("/mnt/d/dir/file.png");
    expect(windowsToWslPath("C:\\")).toBe("/mnt/c");
  });
});

describe("tokenizePathLikeText (Windows)", () => {
  test("captures a double-quoted Windows path with spaces and unicode characters", () => {
    const path = "C:\\Users\\root\\Downloads\\ChatGPT Image 2026년 5월 17일 오후 12_30_07.png";
    const input = `look at "${path}" please`;
    const tokens = tokenizePathLikeText(input);
    expect(tokens.length).toBe(1);
    expect(tokens[0]!.value).toBe(path);
  });

  test("captures an unquoted Windows path without spaces", () => {
    const input = "see C:\\Users\\root\\a.png now";
    const tokens = tokenizePathLikeText(input);
    expect(tokens.length).toBe(1);
    expect(tokens[0]!.value).toBe("C:\\Users\\root\\a.png");
  });

  test("does not collapse backslashes inside a quoted Windows path", () => {
    const input = '"C:\\a\\b\\c.png"';
    const tokens = tokenizePathLikeText(input);
    expect(tokens[0]!.value).toBe("C:\\a\\b\\c.png");
  });
});
