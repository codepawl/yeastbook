import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PluginLoader } from "../packages/app/src/plugins/loader.ts";

describe("PluginLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ybk-plugins-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads valid plugin files", async () => {
    await Bun.write(join(tempDir, "test.ts"), `export default { name: "test", version: "1.0.0", renderers: [{
      type: "custom", displayName: "Custom",
      canRender: (v) => typeof v === "object" && v?.__type === "custom",
      serialize: (v) => ({ data: v }),
    }] };`);
    const loader = new PluginLoader(tempDir);
    await loader.loadAll();
    expect(loader.getPlugins()).toHaveLength(1);
  });

  test("skips invalid plugin files", async () => {
    await Bun.write(join(tempDir, "bad.ts"), "export default { invalid: true }");
    const loader = new PluginLoader(tempDir);
    await loader.loadAll();
    expect(loader.getPlugins()).toHaveLength(0);
  });

  test("findRenderer returns matching renderer", async () => {
    await Bun.write(join(tempDir, "t.ts"), `export default { name: "p", version: "1.0.0", renderers: [{
      type: "custom", displayName: "C",
      canRender: (v) => typeof v === "object" && v?.__type === "custom",
      serialize: (v) => ({ data: v }),
    }] };`);
    const loader = new PluginLoader(tempDir);
    await loader.loadAll();
    expect(loader.findRenderer({ __type: "custom" })?.type).toBe("custom");
  });

  test("findRenderer returns null for no match", async () => {
    const loader = new PluginLoader(tempDir);
    await loader.loadAll();
    expect(loader.findRenderer("x")).toBeNull();
  });

  test("loads from non-existent directory", async () => {
    const loader = new PluginLoader(join(tempDir, "nope"));
    await loader.loadAll();
    expect(loader.getPlugins()).toHaveLength(0);
  });
});
