import { test, expect, describe } from "bun:test";
import { parseMagicCommands } from "../packages/core/src/magic.ts";

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
});
