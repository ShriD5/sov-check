import { FIELD_BY_ID } from "../lib/schema.js";
import { useRun } from "../store/runStore.js";
import type { SourceRef } from "../lib/types.js";

function describeSource(source: SourceRef | null, raw: string): string {
  if (source?.kind === "sheet") return `${source.sheet} · cell ${source.a1}`;
  if (source?.kind === "pdf") return `page ${source.page} · line ${source.line}`;
  if (raw === "(derived)") return "derived from building + contents + BI";
  if (raw === "(assumed)") return "assumed default";
  return "no source";
}

export function SidePanel() {
  const selected = useRun((s) => s.selected);
  const rows = useRun((s) => s.rows);
  const flags = useRun((s) => s.flags);
  const clear = useRun((s) => s.clearSelection);

  if (!selected) {
    return (
      <div className="w-[320px] shrink-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <p className="text-sm text-[var(--color-muted)]">
          Click any cell to see where the number came from. Double-click to correct it.
        </p>
      </div>
    );
  }

  const row = rows.find((r) => r.key === selected.rowKey);
  if (!row) return null;

  const cell = row[selected.field];
  const field = FIELD_BY_ID[selected.field];
  const cellFlags = flags.filter((f) => f.rowKey === row.key && f.field === selected.field);

  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{field.label}</p>
          <p className="mt-1 break-words text-lg">
            {cell.value === null ? <span className="text-[#4d545f]">empty</span> : String(cell.value)}
          </p>
        </div>
        <button onClick={clear} className="text-sm text-[var(--color-muted)] hover:text-white">
          ✕
        </button>
      </div>

      <dl className="space-y-2 text-[13px]">
        <div>
          <dt className="text-[var(--color-muted)]">Source</dt>
          <dd className="font-mono text-[#cfd6e2]">{describeSource(cell.source, cell.raw)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Raw text in the file</dt>
          <dd className="font-mono break-words text-[#cfd6e2]">
            {cell.raw || <span className="text-[#4d545f]">blank</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Confidence</dt>
          <dd className="text-[#cfd6e2]">
            {Math.round(cell.confidence * 100)}%{cell.edited ? " · edited by you" : ""}
          </dd>
        </div>
      </dl>

      {cellFlags.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
          {cellFlags.map((flag) => (
            <p
              key={flag.id}
              className={`text-[13px] ${
                flag.level === "error"
                  ? "text-[var(--color-bad)]"
                  : flag.level === "warn"
                    ? "text-[var(--color-warn)]"
                    : "text-[var(--color-muted)]"
              }`}
            >
              {flag.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlagsPanel() {
  const flags = useRun((s) => s.flags);
  const select = useRun((s) => s.select);

  // Group by issue and field: "Year built is missing" and "Construction is
  // missing" are different problems even though they share a code.
  const grouped = flags.reduce<Record<string, typeof flags>>((acc, flag) => {
    (acc[`${flag.code}:${flag.field ?? ""}`] ??= []).push(flag);
    return acc;
  }, {});

  const rank = { error: 0, warn: 1, info: 2 } as const;
  const order = Object.entries(grouped).sort(
    (a, b) => rank[a[1][0].level] - rank[b[1][0].level] || b[1].length - a[1].length,
  );

  if (!flags.length) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-sm text-[var(--color-muted)]">
        No issues found yet.
      </div>
    );
  }

  return (
    <div className="max-h-[240px] overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]">
      {order.map(([code, group]) => (
        <div key={code} className="border-b border-[var(--color-line)] last:border-b-0">
          <div className="flex items-baseline justify-between px-4 py-2">
            <span
              className={`text-[13px] ${
                group[0].level === "error"
                  ? "text-[var(--color-bad)]"
                  : group[0].level === "warn"
                    ? "text-[var(--color-warn)]"
                    : "text-[var(--color-muted)]"
              }`}
            >
              {group[0].message}
            </span>
            <span className="ml-3 shrink-0 text-xs text-[var(--color-muted)]">
              {group[0].field === null ? "whole file" : `${group.length} row${group.length > 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            {group[0].field !== null && group.slice(0, 12).map((flag) => (
              <button
                key={flag.id}
                onClick={() => flag.field && select(flag.rowKey, flag.field)}
                className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-white"
              >
                {flag.rowKey.split(":").slice(1, 3).join("/")}
              </button>
            ))}
            {group[0].field !== null && group.length > 12 && (
              <span className="px-1 py-0.5 text-[11px] text-[var(--color-muted)]">
                +{group.length - 12} more
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
