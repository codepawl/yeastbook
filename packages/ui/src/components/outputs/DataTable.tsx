import { useState, useMemo, useCallback } from "react";

interface Props {
  rows: Record<string, unknown>[];
}

const PAGE_SIZE = 100;

export function DataTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]!);
  }, [rows]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = va < vb ? -1 : 1;
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortKey, sortAsc]);

  const displayed = showAll ? sorted : sorted.slice(0, PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return key;
      }
      setSortAsc(true);
      return key;
    });
  }, []);

  if (rows.length === 0) return <div className="output-result">Empty array</div>;

  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} onClick={() => handleSort(col)}>
                {col}
                {sortKey === col && (
                  <span className="sort-indicator">{sortAsc ? " \u25B4" : " \u25BE"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{formatCell(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && rows.length > PAGE_SIZE && (
        <button className="show-more-btn" onClick={() => setShowAll(true)}>
          Show all {rows.length} rows
        </button>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
