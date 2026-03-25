import { useState, useMemo } from "react";
import { JsonTree } from "./JsonTree.tsx";
import DOMPurify from "dompurify";

interface FileData {
  path: string;
  name: string;
  mimeType: string;
  size: number;
  content?: string;
  streamUrl?: string;
  mode: "embedded" | "stream";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function CsvPreview({ content, mimeType }: { content: string; mimeType: string }) {
  const sep = mimeType.includes("tab") ? "\t" : ",";
  const PAGE_SIZE = 50;

  const { headers, rows, totalRows } = useMemo(() => {
    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };
    const headers = lines[0]!.split(sep);
    const rows = lines.slice(1, 1001).map(l => l.split(sep));
    return { headers, rows, totalRows: lines.length - 1 };
  }, [content, sep]);

  const [page, setPage] = useState(0);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  if (headers.length === 0) return <div className="file-preview-empty">Empty file</div>;

  return (
    <div className="csv-preview">
      {totalRows > 1000 && (
        <div className="csv-truncate-notice">Showing first 1,000 of {totalRows.toLocaleString()} rows</div>
      )}
      <div className="csv-table-wrapper">
        <table className="csv-table">
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="csv-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>&#8592;</button>
          <span>{page + 1} / {totalPages}</span>
          <button disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>&#8594;</button>
        </div>
      )}
    </div>
  );
}

function CodePreview({ content, maxLines = 500 }: { content: string; maxLines?: number }) {
  const lines = content.split("\n");
  const truncated = lines.length > maxLines;
  const displayContent = truncated ? lines.slice(0, maxLines).join("\n") : content;

  return (
    <div className="code-preview">
      <pre className="code-preview-content">{displayContent}</pre>
      {truncated && <div className="code-preview-truncated">... {lines.length - maxLines} more lines</div>}
    </div>
  );
}

function FontPreview({ url, name }: { url: string; name: string }) {
  const fontName = `preview-${name.replace(/[^a-zA-Z0-9]/g, "")}`;
  const fontFace = `@font-face { font-family: "${fontName}"; src: url("${url}"); }`;

  return (
    <div className="font-preview">
      <style>{fontFace}</style>
      <div style={{ fontFamily: `"${fontName}"`, fontSize: 32, lineHeight: 1.4 }}>
        ABCDEFGHIJKLM<br/>NOPQRSTUVWXYZ<br/>abcdefghijklm<br/>nopqrstuvwxyz<br/>0123456789
      </div>
      <div style={{ fontFamily: `"${fontName}"`, fontSize: 18, marginTop: 12, color: "var(--text-muted)" }}>
        The quick brown fox jumps over the lazy dog
      </div>
    </div>
  );
}

function renderPreview(data: FileData) {
  const { name, mimeType, size, content, streamUrl, mode } = data;
  const url = streamUrl;
  const isText = mimeType.startsWith("text/") || ["application/json", "application/jsonlines", "application/xml"].includes(mimeType);

  // Images — SVG content is sanitized via DOMPurify before rendering
  if (mimeType.startsWith("image/")) {
    if (mimeType === "image/svg+xml" && content) {
      const sanitized = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } });
      return <div className="svg-preview" dangerouslySetInnerHTML={{ __html: sanitized }} />;
    }
    const src = mode === "embedded" && content ? `data:${mimeType};base64,${content}` : url;
    return src ? (
      <img src={src} alt={name} loading="lazy" style={{ maxWidth: "100%", maxHeight: 600, objectFit: "contain" }} />
    ) : null;
  }

  // Video — never autoplay
  if (mimeType.startsWith("video/")) {
    return (
      <video controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 400 }}>
        <source src={url} type={mimeType} />
        Video not supported
      </video>
    );
  }

  // Audio
  if (mimeType.startsWith("audio/")) {
    return <audio controls preload="metadata" src={url} style={{ width: "100%" }} />;
  }

  // PDF
  if (mimeType === "application/pdf") {
    return <iframe src={`${url}#toolbar=0`} style={{ width: "100%", height: 600, border: "none" }} title={name} />;
  }

  // CSV / TSV
  if (mimeType === "text/csv" || mimeType === "text/tab-separated-values") {
    return content ? <CsvPreview content={content} mimeType={mimeType} /> : <div className="file-preview-empty">No content</div>;
  }

  // JSON
  if (mimeType === "application/json" || mimeType === "application/jsonlines") {
    if (!content) return <div className="file-preview-empty">No content</div>;
    if (size > 500 * 1024) {
      return <CodePreview content={content} maxLines={200} />;
    }
    try {
      const parsed = JSON.parse(content);
      return <JsonTree data={parsed} />;
    } catch {
      return <CodePreview content={content} />;
    }
  }

  // Fonts
  if (mimeType.startsWith("font/")) {
    return url ? <FontPreview url={url} name={name} /> : <div className="file-preview-empty">Cannot preview font</div>;
  }

  // Archives
  if (["application/zip", "application/x-tar", "application/gzip", "application/x-7z-compressed"].includes(mimeType)) {
    return (
      <div className="archive-preview">
        <i className="bi bi-file-zip" style={{ fontSize: 24 }} />
        <span>Archive file — {formatBytes(size)}</span>
        <span className="text-muted">Open in terminal to inspect contents</span>
      </div>
    );
  }

  // Text / code files
  if (isText && content) {
    return <CodePreview content={content} />;
  }

  // Unknown binary
  return (
    <div className="archive-preview">
      <i className="bi bi-file-binary" style={{ fontSize: 24 }} />
      <span>Binary file — {formatBytes(size)}</span>
      <span className="text-muted">{mimeType}</span>
    </div>
  );
}

export function FilePreviewOutput({ output }: { output: FileData }) {
  const { name, mimeType, size, streamUrl, content } = output;
  const downloadUrl = streamUrl ?? (content ? `data:${mimeType};base64,${content}` : undefined);

  return (
    <div className="file-preview-output">
      <div className="file-preview-output-header">
        <span className="file-preview-output-name">{name}</span>
        <span className="file-preview-output-meta">{formatBytes(size)}</span>
        {downloadUrl && (
          <a className="file-preview-output-download" href={downloadUrl} download={name} title="Download">
            <i className="bi bi-download" />
          </a>
        )}
      </div>
      <div className="file-preview-output-body">
        {renderPreview(output)}
      </div>
    </div>
  );
}
