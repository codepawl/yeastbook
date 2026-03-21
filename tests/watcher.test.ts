import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { watchNotebook, createOwnWriteMarker } from "../src/watcher.ts";

describe("watchNotebook", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ybk-watcher-"));
    testFile = join(tempDir, "test.ybk");
    await Bun.write(testFile, JSON.stringify({ cells: [] }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("triggers callback on external file change", async () => {
    let triggered = false;
    const stop = watchNotebook(testFile, () => { triggered = true; });
    await Bun.sleep(100);
    await Bun.write(testFile, JSON.stringify({ cells: [{ id: "1" }] }));
    await Bun.sleep(400);
    expect(triggered).toBe(true);
    stop();
  });

  test("debounces rapid changes", async () => {
    let callCount = 0;
    const stop = watchNotebook(testFile, () => { callCount++; });
    await Bun.sleep(100);
    await Bun.write(testFile, "a");
    await Bun.sleep(50);
    await Bun.write(testFile, "b");
    await Bun.sleep(50);
    await Bun.write(testFile, "c");
    await Bun.sleep(400);
    expect(callCount).toBe(1);
    stop();
  });

  test("markOwnWrite prevents callback", async () => {
    let triggered = false;
    const marker = createOwnWriteMarker();
    const stop = watchNotebook(testFile, () => { triggered = true; }, marker);
    await Bun.sleep(100);
    marker.mark();
    await Bun.write(testFile, JSON.stringify({ cells: [{ id: "own" }] }));
    await Bun.sleep(400);
    expect(triggered).toBe(false);
    stop();
  });
});
