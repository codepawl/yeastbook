#!/usr/bin/env bun
// src/cli.ts — Yeastbook CLI

import { resolve } from "node:path";
import { startServer } from "./server.ts";

const args = process.argv.slice(2);
const target = args[0];

if (!target) {
  console.log("Usage: yeastbook <file.ipynb>    Open or create a notebook");
  console.log("       yeastbook new             Create a new empty notebook");
  process.exit(0);
}

let filePath: string;

if (target === "new") {
  filePath = resolve(`notebook-${Date.now()}.ipynb`);
  console.log(`Creating new notebook: ${filePath}`);
} else {
  filePath = resolve(target);
}

const port = parseInt(process.env.PORT ?? "3000", 10);
const server = await startServer(filePath, port);
console.log(`Yeastbook running at http://localhost:${server.port}`);
console.log(`Notebook: ${filePath}`);
