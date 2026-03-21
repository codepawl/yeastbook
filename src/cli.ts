#!/usr/bin/env bun
// src/cli.ts — Yeastbook CLI

import { resolve, basename, dirname, join, extname } from "node:path";
import { unlink } from "node:fs/promises";
import { startServer } from "./server.ts";
import { loadNotebook, saveNotebook, ybkToIpynb, ipynbToYbk, createEmptyYbk } from "./format.ts";
import type { IpynbNotebook } from "./format.ts";

async function checkWritePermission(): Promise<void> {
  const testFile = resolve(".yeastbook-write-test");
  try {
    await Bun.write(testFile, "");
    await unlink(testFile);
  } catch {
    console.error("Error: No write permission in current directory.");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log("Usage:");
  console.log("  yeastbook new [--ipynb]           Create a new notebook (.ybk default)");
  console.log("  yeastbook <file.ybk|file.ipynb>   Open a notebook");
  console.log("  yeastbook export <file.ybk>       Convert .ybk → .ipynb");
  console.log("  yeastbook import <file.ipynb>     Convert .ipynb → .ybk");
  process.exit(0);
}

if (command === "new") {
  await checkWritePermission();
  const useIpynb = args.includes("--ipynb");
  const ext = useIpynb ? ".ipynb" : ".ybk";
  const filePath = resolve(`notebook-${Date.now()}${ext}`);
  console.log(`Creating new notebook: ${filePath}`);

  const port = parseInt(process.env.PORT ?? "3000", 10);
  const server = await startServer(filePath, port);
  console.log(`Yeastbook running at http://localhost:${server.port}`);
  console.log(`Notebook: ${filePath}`);
} else if (command === "export") {
  const srcPath = resolve(args[1] ?? "");
  if (!srcPath || !srcPath.endsWith(".ybk")) {
    console.error("Usage: yeastbook export <file.ybk>");
    process.exit(1);
  }
  const { notebook } = await loadNotebook(srcPath);
  const ipynb = ybkToIpynb(notebook);
  const destPath = join(dirname(srcPath), basename(srcPath, ".ybk") + ".ipynb");
  await Bun.write(destPath, JSON.stringify(ipynb, null, 2) + "\n");
  console.log(`Exported: ${srcPath} → ${destPath}`);
} else if (command === "import") {
  const srcPath = resolve(args[1] ?? "");
  if (!srcPath || !srcPath.endsWith(".ipynb")) {
    console.error("Usage: yeastbook import <file.ipynb>");
    process.exit(1);
  }
  const data: IpynbNotebook = await Bun.file(srcPath).json();
  const ybk = ipynbToYbk(data);
  const destPath = join(dirname(srcPath), basename(srcPath, ".ipynb") + ".ybk");
  await Bun.write(destPath, JSON.stringify(ybk, null, 2) + "\n");
  console.log(`Imported: ${srcPath} → ${destPath}`);
} else {
  // Open existing notebook
  await checkWritePermission();
  const filePath = resolve(command);
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const server = await startServer(filePath, port);
  console.log(`Yeastbook running at http://localhost:${server.port}`);
  console.log(`Notebook: ${filePath}`);
}
