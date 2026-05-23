import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_PASTER_CONFIG, resolvePasterConfig } from "../src/index.ts";

describe("resolvePasterConfig", () => {
  test("enables image compression command by default", () => {
    const config = resolvePasterConfig();

    expect(config.imageCompression).toEqual(DEFAULT_PASTER_CONFIG.imageCompression);
    expect(config.imageCompression.enabled).toBe(true);
    expect(config.imageCompression.command).toBe("image-compress");
    expect(config.imageCompression.model).toBe("openai-codex/gpt-5.4-mini");
    expect(config.imageCompression.includeReport).toBe(true);
  });

  test("allows image compression overrides", () => {
    const config = resolvePasterConfig({
      imageCompression: {
        enabled: false,
        command: "compress-images",
        model: "",
        prompt: "Describe briefly.",
        piCommand: "/usr/local/bin/pi",
        timeoutMs: 5000,
        includeReport: false,
      },
    });

    expect(config.imageCompression).toEqual({
      enabled: false,
      command: "compress-images",
      model: "",
      prompt: "Describe briefly.",
      piCommand: "/usr/local/bin/pi",
      timeoutMs: 5000,
      includeReport: false,
    });
  });
});
