// src/kernel/index.ts

import * as zmq from "zeromq";
import {
  type ConnectionInfo,
  type JupyterMessage,
  createMessage,
  serialize,
  deserialize,
} from "../protocol/messages.ts";
import { executeCode } from "./execute.ts";

export { executeCode, type ExecResult } from "./execute.ts";

export class Kernel {
  private connectionInfo: ConnectionInfo;
  private shell: zmq.Router;
  private control: zmq.Router;
  private iopub: zmq.Publisher;
  private stdin: zmq.Router;
  private heartbeat: zmq.Reply;
  private executionCount = 0;
  private context: Record<string, unknown> = {};

  constructor(connectionInfo: ConnectionInfo) {
    this.connectionInfo = connectionInfo;
    this.shell = new zmq.Router();
    this.control = new zmq.Router();
    this.iopub = new zmq.Publisher();
    this.stdin = new zmq.Router();
    this.heartbeat = new zmq.Reply();
  }

  private addr(port: number): string {
    return `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${port}`;
  }

  private get key(): string {
    return this.connectionInfo.key;
  }

  async start(): Promise<void> {
    await Promise.all([
      this.shell.bind(this.addr(this.connectionInfo.shell_port)),
      this.control.bind(this.addr(this.connectionInfo.control_port)),
      this.iopub.bind(this.addr(this.connectionInfo.iopub_port)),
      this.stdin.bind(this.addr(this.connectionInfo.stdin_port)),
      this.heartbeat.bind(this.addr(this.connectionInfo.hb_port)),
    ]);

    // Launch all loops concurrently
    this.heartbeatLoop();
    this.shellLoop();
    this.controlLoop();

    console.log("Yeastbook kernel started");
  }

  private async heartbeatLoop(): Promise<void> {
    for await (const [msg] of this.heartbeat) {
      await this.heartbeat.send(msg);
    }
  }

  // Placeholder methods for shell and control loops (to be implemented)
  private async shellLoop(): Promise<void> {}
  private async controlLoop(): Promise<void> {}
} // end of Kernel class
