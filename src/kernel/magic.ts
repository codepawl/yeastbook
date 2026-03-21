// src/kernel/magic.ts — Parse magic commands from cell code

export interface MagicCommand {
  type: "install";
  packages: string[];
}

export interface ParseResult {
  magic: MagicCommand[];
  cleanCode: string;
}

export function parseMagicCommands(code: string): ParseResult {
  const lines = code.split("\n");
  const magic: MagicCommand[] = [];
  const cleanLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%install")) {
      const rest = trimmed.slice("%install".length).replace(/\/\/.*$/, "").trim();
      const packages = rest ? rest.split(/\s+/) : [];
      magic.push({ type: "install", packages });
    } else {
      cleanLines.push(line);
    }
  }

  return {
    magic,
    cleanCode: cleanLines.join("\n").trim(),
  };
}
