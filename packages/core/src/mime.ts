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
