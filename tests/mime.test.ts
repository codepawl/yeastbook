import { test, expect, describe } from "bun:test";
import { detectMimeOutput } from "../packages/core/src/mime.ts";

describe("detectMimeOutput", () => {
  test("detects image/png", () => {
    const val = { __mime: "image/png", data: "base64data" };
    expect(detectMimeOutput(val)).toEqual({ type: "mime", mime: "image/png", data: "base64data" });
  });

  test("detects image/svg+xml", () => {
    const val = { __mime: "image/svg+xml", data: "<svg></svg>" };
    expect(detectMimeOutput(val)).toEqual({ type: "mime", mime: "image/svg+xml", data: "<svg></svg>" });
  });

  test("detects audio with url", () => {
    const val = { __mime: "audio/mp3", url: "file:///song.mp3" };
    expect(detectMimeOutput(val)).toEqual({ type: "mime", mime: "audio/mp3", url: "file:///song.mp3" });
  });

  test("detects video with url", () => {
    const val = { __mime: "video/mp4", url: "file:///video.mp4" };
    expect(detectMimeOutput(val)).toEqual({ type: "mime", mime: "video/mp4", url: "file:///video.mp4" });
  });

  test("returns null for non-mime objects", () => {
    expect(detectMimeOutput({ name: "Alice" })).toBeNull();
    expect(detectMimeOutput("hello")).toBeNull();
    expect(detectMimeOutput(42)).toBeNull();
  });
});
