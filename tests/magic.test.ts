import { test, expect, describe } from "bun:test";
import { parseMagicCommands } from "../packages/core/src/magic.ts";
import { detectMimeType, isTextMime } from "../packages/core/src/mime.ts";

describe("parseMagicCommands", () => {
  test("parses single %install command", () => {
    const result = parseMagicCommands("%install lodash");
    expect(result.magic).toEqual([{ type: "install", packages: ["lodash"] }]);
    expect(result.cleanCode).toBe("");
  });

  test("parses multiple packages on one line", () => {
    const result = parseMagicCommands("%install lodash axios dayjs");
    expect(result.magic).toEqual([{ type: "install", packages: ["lodash", "axios", "dayjs"] }]);
    expect(result.cleanCode).toBe("");
  });

  test("preserves non-magic code as cleanCode", () => {
    const code = "%install lodash\nconst _ = require('lodash');\nconsole.log(_.chunk([1,2,3,4], 2));";
    const result = parseMagicCommands(code);
    expect(result.magic).toEqual([{ type: "install", packages: ["lodash"] }]);
    expect(result.cleanCode).toBe("const _ = require('lodash');\nconsole.log(_.chunk([1,2,3,4], 2));");
  });

  test("handles multiple %install lines", () => {
    const code = "%install lodash\n%install axios\nfetch('url')";
    const result = parseMagicCommands(code);
    expect(result.magic).toHaveLength(2);
    expect(result.magic[0]).toEqual({ type: "install", packages: ["lodash"] });
    expect(result.magic[1]).toEqual({ type: "install", packages: ["axios"] });
    expect(result.cleanCode).toBe("fetch('url')");
  });

  test("code with no magic commands returns empty magic array", () => {
    const result = parseMagicCommands("const x = 1;\nx + 2");
    expect(result.magic).toEqual([]);
    expect(result.cleanCode).toBe("const x = 1;\nx + 2");
  });

  test("empty %install returns error-like empty packages", () => {
    const result = parseMagicCommands("%install");
    expect(result.magic).toEqual([{ type: "install", packages: [] }]);
  });

  test("handles leading/trailing whitespace on magic lines", () => {
    const result = parseMagicCommands("  %install lodash  ");
    expect(result.magic).toEqual([{ type: "install", packages: ["lodash"] }]);
    expect(result.cleanCode).toBe("");
  });

  test("does not treat %install inside strings as magic", () => {
    const code = 'const s = "%install lodash"';
    const result = parseMagicCommands(code);
    expect(result.magic).toEqual([]);
    expect(result.cleanCode).toBe(code);
  });

  test("ignores trailing comments on %install line", () => {
    const result = parseMagicCommands("%install lodash // install lodash");
    expect(result.magic).toEqual([{ type: "install", packages: ["lodash"] }]);
  });

  test("%timeit extracts correctly and cleanCode is empty", () => {
    const result = parseMagicCommands("%timeit -n5 await fetch('url')");
    expect(result.magic[0]?.type).toBe("timeit");
    expect((result.magic[0] as any)?.runs).toBe(5);
    expect((result.magic[0] as any)?.code).toBe("await fetch('url')");
    expect(result.cleanCode.trim()).toBe("");
  });

  test("%timeit with default runs", () => {
    const result = parseMagicCommands("%timeit 1+1");
    expect(result.magic[0]?.type).toBe("timeit");
    expect((result.magic[0] as any)?.runs).toBe(100);
    expect((result.magic[0] as any)?.code).toBe("1+1");
    expect(result.cleanCode.trim()).toBe("");
  });

  test("%time extracts correctly", () => {
    const result = parseMagicCommands("%time await Bun.sleep(10)");
    expect(result.magic[0]?.type).toBe("time");
    expect((result.magic[0] as any)?.code).toBe("await Bun.sleep(10)");
    expect(result.cleanCode.trim()).toBe("");
  });

  test("%timeit with code on following lines leaves cleanCode", () => {
    const result = parseMagicCommands("%timeit -n5 1+1\nconst x = 42");
    expect(result.magic).toHaveLength(1);
    expect(result.magic[0]?.type).toBe("timeit");
    expect(result.cleanCode).toBe("const x = 42");
  });

  test("%open parses file path", () => {
    const result = parseMagicCommands("%open ./data.csv");
    expect(result.magic).toEqual([{ type: "open", filePath: "./data.csv" }]);
    expect(result.cleanCode).toBe("");
  });

  test("%open strips quotes from path", () => {
    const result = parseMagicCommands('%open "my file.png"');
    expect(result.magic).toEqual([{ type: "open", filePath: "my file.png" }]);
  });

  test("%open with remaining code", () => {
    const result = parseMagicCommands("%open ./image.png\nconsole.log('done')");
    expect(result.magic).toHaveLength(1);
    expect(result.magic[0]?.type).toBe("open");
    expect(result.cleanCode).toBe("console.log('done')");
  });
});

describe("detectMimeType", () => {
  test("detects common image types", () => {
    expect(detectMimeType("photo.png")).toBe("image/png");
    expect(detectMimeType("photo.jpg")).toBe("image/jpeg");
    expect(detectMimeType("icon.svg")).toBe("image/svg+xml");
  });

  test("detects video types", () => {
    expect(detectMimeType("video.mp4")).toBe("video/mp4");
    expect(detectMimeType("clip.webm")).toBe("video/webm");
  });

  test("detects data types", () => {
    expect(detectMimeType("data.csv")).toBe("text/csv");
    expect(detectMimeType("config.json")).toBe("application/json");
    expect(detectMimeType("readme.md")).toBe("text/markdown");
  });

  test("detects code types", () => {
    expect(detectMimeType("app.ts")).toBe("text/typescript");
    expect(detectMimeType("script.py")).toBe("text/x-python");
  });

  test("falls back to octet-stream for unknown", () => {
    expect(detectMimeType("file.xyz")).toBe("application/octet-stream");
  });

  test("uses fallback when provided", () => {
    expect(detectMimeType("file.xyz", "text/plain")).toBe("text/plain");
  });
});

describe("isTextMime", () => {
  test("text/* is text", () => {
    expect(isTextMime("text/plain")).toBe(true);
    expect(isTextMime("text/csv")).toBe(true);
    expect(isTextMime("text/typescript")).toBe(true);
  });

  test("json and xml are text", () => {
    expect(isTextMime("application/json")).toBe(true);
    expect(isTextMime("application/xml")).toBe(true);
  });

  test("binary types are not text", () => {
    expect(isTextMime("image/png")).toBe(false);
    expect(isTextMime("application/pdf")).toBe(false);
    expect(isTextMime("application/octet-stream")).toBe(false);
  });
});
