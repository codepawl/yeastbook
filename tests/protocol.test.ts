import { test, expect, describe } from "bun:test";
import { sign, createMessage, serialize, deserialize } from "../src/protocol/messages.ts";

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

describe("serialize", () => {
  test("produces correct frame structure", () => {
    const msg = createMessage("status", { execution_state: "idle" });
    msg.identities = [Buffer.from("client-id")];
    const frames = serialize(msg, "test-key");
    // [identity, delimiter, signature, header, parent_header, metadata, content]
    expect(frames).toHaveLength(7);
    expect(frames[0]).toEqual(Buffer.from("client-id"));
    expect(frames[1]).toEqual(Buffer.from("<IDS|MSG>"));
    expect(frames[2]).toBeInstanceOf(Buffer); // signature
    // frames 3-6 are JSON buffers
    expect(JSON.parse(frames[3]!.toString())).toHaveProperty("msg_type", "status");
  });

  test("signature matches sign() output", () => {
    const msg = createMessage("status", { execution_state: "idle" });
    msg.identities = [Buffer.from("test-id")];
    const frames = serialize(msg, "my-key");
    // frames: [identity, delimiter, signature, header, parent, meta, content]
    const headerStr = frames[3]!.toString();
    const parentStr = frames[4]!.toString();
    const metaStr = frames[5]!.toString();
    const contentStr = frames[6]!.toString();
    const expected = sign("my-key", headerStr, parentStr, metaStr, contentStr);
    expect(frames[2]!.toString()).toBe(expected);
  });
});

describe("deserialize", () => {
  test("round-trips through serialize/deserialize", () => {
    const msg = createMessage("execute_request", { code: "1+1" });
    msg.identities = [Buffer.from("abc")];
    const frames = serialize(msg, "key123");
    const restored = deserialize(frames, "key123");
    expect(restored.header.msg_type).toBe("execute_request");
    expect(restored.content).toEqual({ code: "1+1" });
    expect(restored.identities).toEqual([Buffer.from("abc")]);
  });

  test("throws on invalid signature", () => {
    const msg = createMessage("status", {});
    const frames = serialize(msg, "key1");
    expect(() => deserialize(frames, "wrong-key")).toThrow();
  });

  test("skips signature check when key is empty", () => {
    const msg = createMessage("status", {});
    const frames = serialize(msg, "");
    const restored = deserialize(frames, "");
    expect(restored.header.msg_type).toBe("status");
  });
});
