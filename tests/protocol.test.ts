import { test, expect, describe } from "bun:test";
import { sign, createMessage } from "../src/protocol/messages.ts";

describe("HMAC signing", () => {
  test("signs concatenated frames with SHA256", () => {
    const sig = sign("test-key", "header", "parent", "meta", "content");
    expect(sig).toBeString();
    expect(sig).toHaveLength(64); // hex-encoded SHA256
  });

  test("same input produces same signature", () => {
    const sig1 = sign("key", "a", "b", "c", "d");
    const sig2 = sign("key", "a", "b", "c", "d");
    expect(sig1).toBe(sig2);
  });

  test("different input produces different signature", () => {
    const sig1 = sign("key", "a", "b", "c", "d");
    const sig2 = sign("key", "a", "b", "c", "e");
    expect(sig1).not.toBe(sig2);
  });

  test("empty key returns empty signature", () => {
    const sig = sign("", "a", "b", "c", "d");
    expect(sig).toBe("");
  });
});

describe("createMessage", () => {
  test("creates message with correct msg_type", () => {
    const msg = createMessage("kernel_info_reply", { status: "ok" });
    expect(msg.header.msg_type).toBe("kernel_info_reply");
    expect(msg.content).toEqual({ status: "ok" });
  });

  test("generates unique msg_id", () => {
    const msg1 = createMessage("status", {});
    const msg2 = createMessage("status", {});
    expect(msg1.header.msg_id).not.toBe(msg2.header.msg_id);
  });

  test("sets parent_header from parent message", () => {
    const parent = createMessage("execute_request", { code: "1+1" });
    const reply = createMessage("execute_reply", { status: "ok" }, parent);
    expect(reply.parent_header).toEqual(parent.header);
  });

  test("sets protocol version to 5.3", () => {
    const msg = createMessage("status", {});
    expect(msg.header.version).toBe("5.3");
  });

  test("sets ISO date string", () => {
    const msg = createMessage("status", {});
    expect(msg.header.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
