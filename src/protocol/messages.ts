import { createHmac } from "node:crypto";

export interface ConnectionInfo {
  ip: string;
  transport: string;
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
  key: string;
  signature_scheme: string;
  kernel_name: string;
}

export interface MessageHeader {
  msg_id: string;
  session: string;
  username: string;
  msg_type: string;
  version: string;
  date: string;
}

export interface JupyterMessage {
  identities: Buffer[];
  header: MessageHeader;
  parent_header: MessageHeader | Record<string, never>;
  metadata: Record<string, unknown>;
  content: Record<string, unknown>;
}

const SESSION_ID = crypto.randomUUID();

export function sign(
  key: string,
  header: string,
  parent_header: string,
  metadata: string,
  content: string,
): string {
  if (!key) return "";
  const hmac = createHmac("sha256", key);
  hmac.update(header);
  hmac.update(parent_header);
  hmac.update(metadata);
  hmac.update(content);
  return hmac.digest("hex");
}

export function createMessage(
  msgType: string,
  content: Record<string, unknown>,
  parent?: JupyterMessage,
): JupyterMessage {
  return {
    identities: parent?.identities ?? [],
    header: {
      msg_id: crypto.randomUUID(),
      session: SESSION_ID,
      username: "yeastbook",
      msg_type: msgType,
      version: "5.3",
      date: new Date().toISOString(),
    },
    parent_header: parent?.header ?? {},
    metadata: {},
    content,
  };
}

const DELIMITER = Buffer.from("<IDS|MSG>");

export function serialize(msg: JupyterMessage, key: string): Buffer[] {
  const headerStr = JSON.stringify(msg.header);
  const parentStr = JSON.stringify(msg.parent_header);
  const metadataStr = JSON.stringify(msg.metadata);
  const contentStr = JSON.stringify(msg.content);
  const sig = sign(key, headerStr, parentStr, metadataStr, contentStr);

  return [
    ...msg.identities,
    DELIMITER,
    Buffer.from(sig),
    Buffer.from(headerStr),
    Buffer.from(parentStr),
    Buffer.from(metadataStr),
    Buffer.from(contentStr),
  ];
}

export function deserialize(frames: Buffer[], key: string): JupyterMessage {
  // Find delimiter index
  let delimIdx = -1;
  for (let i = 0; i < frames.length; i++) {
    if (Buffer.isBuffer(frames[i]) && frames[i]!.equals(DELIMITER)) {
      delimIdx = i;
      break;
    }
  }
  if (delimIdx === -1) {
    throw new Error("Missing <IDS|MSG> delimiter in message frames");
  }

  const identities = frames.slice(0, delimIdx) as Buffer[];
  const signature = frames[delimIdx + 1]!.toString();
  const headerStr = frames[delimIdx + 2]!.toString();
  const parentStr = frames[delimIdx + 3]!.toString();
  const metadataStr = frames[delimIdx + 4]!.toString();
  const contentStr = frames[delimIdx + 5]!.toString();

  // Validate signature
  if (key) {
    const expected = sign(key, headerStr, parentStr, metadataStr, contentStr);
    if (signature !== expected) {
      throw new Error("Invalid message signature");
    }
  }

  return {
    identities,
    header: JSON.parse(headerStr),
    parent_header: JSON.parse(parentStr),
    metadata: JSON.parse(metadataStr),
    content: JSON.parse(contentStr),
  };
}
