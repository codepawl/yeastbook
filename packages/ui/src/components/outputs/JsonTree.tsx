import { useState, useCallback } from "react";

interface Props {
  data: unknown;
  defaultExpanded?: boolean;
  depth?: number;
}

const MAX_AUTO_EXPAND_DEPTH = 3;

export function JsonTree({ data, defaultExpanded, depth = 0 }: Props) {
  const autoExpand = defaultExpanded ?? depth < MAX_AUTO_EXPAND_DEPTH;
  const [expanded, setExpanded] = useState(autoExpand);
  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (data === null) return <span className="json-null">null</span>;
  if (data === undefined) return <span className="json-null">undefined</span>;

  if (typeof data === "string") {
    return <span className="json-string">"{data}"</span>;
  }
  if (typeof data === "number") {
    return <span className="json-number">{String(data)}</span>;
  }
  if (typeof data === "boolean") {
    return <span className="json-boolean">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="json-bracket">[]</span>;
    return (
      <span className="json-node">
        <button className="json-toggle" onClick={toggle}>
          {expanded ? "\u25BE" : "\u25B8"}
        </button>
        {expanded ? (
          <>
            <span className="json-bracket">[</span>
            <div className="json-children">
              {data.map((item, i) => (
                <div key={i} className="json-entry">
                  <span className="json-index">{i}: </span>
                  <JsonTree data={item} depth={depth + 1} />
                  {i < data.length - 1 && <span className="json-comma">,</span>}
                </div>
              ))}
            </div>
            <span className="json-bracket">]</span>
          </>
        ) : (
          <span className="json-collapsed" onClick={toggle}>
            [{data.length} items]
          </span>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="json-bracket">{"{}"}</span>;
    return (
      <span className="json-node">
        <button className="json-toggle" onClick={toggle}>
          {expanded ? "\u25BE" : "\u25B8"}
        </button>
        {expanded ? (
          <>
            <span className="json-bracket">{"{"}</span>
            <div className="json-children">
              {entries.map(([key, val], i) => (
                <div key={key} className="json-entry">
                  <span className="json-key">{key}: </span>
                  <JsonTree data={val} depth={depth + 1} />
                  {i < entries.length - 1 && <span className="json-comma">,</span>}
                </div>
              ))}
            </div>
            <span className="json-bracket">{"}"}</span>
          </>
        ) : (
          <span className="json-collapsed" onClick={toggle}>
            {"{" + entries.length + " keys}"}
          </span>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}
