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
