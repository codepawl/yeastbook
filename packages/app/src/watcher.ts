// src/watcher.ts -- Watch notebook file for external changes

import { watch, type FSWatcher } from "node:fs";

const DEBOUNCE_MS = 200;

export interface OwnWriteMarker {
  mark(): void;
  check(): boolean;
}

export function createOwnWriteMarker(): OwnWriteMarker {
  let lastOwnWrite = false;
  return {
    mark() { lastOwnWrite = true; },
    check() {
      if (lastOwnWrite) { lastOwnWrite = false; return true; }
      return false;
    },
  };
}

export function watchNotebook(
  filePath: string,
  onExternalChange: () => void,
  ownWriteMarker?: OwnWriteMarker,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher;

  try {
    watcher = watch(filePath, () => {
      if (ownWriteMarker?.check()) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onExternalChange, DEBOUNCE_MS);
    });
  } catch {
    return () => {};
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}
