export interface MimeOutput {
  type: "mime";
  mime: string;
  data?: string;
  url?: string;
}

export function detectMimeOutput(value: unknown): MimeOutput | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.__mime !== "string") return null;
  return {
    type: "mime",
    mime: v.__mime,
    ...(typeof v.data === "string" ? { data: v.data } : {}),
    ...(typeof v.url === "string" ? { url: v.url } : {}),
  };
}

const MIME_MAP: Record<string, string> = {
  // Images
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  ico: "image/x-icon", bmp: "image/bmp", avif: "image/avif",
  // Video
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska",
  ogg: "audio/ogg",
  // Audio
  mp3: "audio/mpeg", wav: "audio/wav",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
  // Documents
  pdf: "application/pdf",
  // Data
  csv: "text/csv", tsv: "text/tab-separated-values",
  json: "application/json", jsonl: "application/jsonlines",
  parquet: "application/vnd.apache.parquet",
  // Text
  txt: "text/plain", md: "text/markdown", log: "text/plain",
  yaml: "text/yaml", yml: "text/yaml", toml: "text/toml",
  xml: "application/xml", html: "text/html",
  // Code
  ts: "text/typescript", tsx: "text/typescript",
  js: "text/javascript", jsx: "text/javascript",
  py: "text/x-python", sh: "text/x-sh",
  css: "text/css", scss: "text/css",
  rs: "text/x-rust", go: "text/x-go",
  java: "text/x-java", c: "text/x-c", cpp: "text/x-c",
  // Archives
  zip: "application/zip", tar: "application/x-tar",
  gz: "application/gzip", "7z": "application/x-7z-compressed",
  // Fonts
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
};

export function detectMimeType(filePath: string, fallback?: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? fallback ?? "application/octet-stream";
}

export function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") ||
    ["application/json", "application/jsonlines", "application/xml"].includes(mime);
}
