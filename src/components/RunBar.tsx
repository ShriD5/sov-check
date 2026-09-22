import { exportCsv, exportJson, exportXlsx } from "../lib/export";
import { useRun, useSummary } from "../store/runStore";

function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function RunBar() {
  const phase = useRun((s) => s.phase);
  const rows = useRun((s) => s.rows);
  const flags = useRun((s) => s.flags);
  const total = useRun((s) => s.total);
  const file = useRun((s) => s.file);
  const edits = useRun((s) => s.edits);
  const undo = useRun((s) => s.undo);
  const cancel = useRun((s) => s.cancel);
  const reset = useRun((s) => s.reset);
  const summary = useSummary();

  const pct = total ? Math.round((rows.length / total) * 100) : 0;
  const streaming = phase === "streaming" || phase === "interrupted";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Stat label="Locations" value={String(summary.locations)} />
        <Stat label="TIV" value={money(summary.tiv)} />
        <Stat
          label="COPE complete"
          value={`${Math.round(summary.copeCompleteness * 100)}%`}
          tone={summary.copeCompleteness > 0.85 ? "good" : "warn"}
        />
        <Stat label="Errors" value={String(summary.errors)} tone={summary.errors ? "bad" : "good"} />
        <Stat label="Warnings" value={String(summary.warnings)} tone={summary.warnings ? "warn" : "good"} />
      </div>

      <div className="flex items-center gap-2">
        {streaming && (
          <>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#1c2027]">
              <div
                className={`h-full rounded-full transition-all ${
                  phase === "interrupted" ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-muted)]">
              {rows.length}/{total}
            </span>
            <button
              onClick={cancel}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm text-[var(--color-muted)] hover:text-white"
            >
              Cancel
            </button>
          </>
        )}

        {edits.length > 0 && (
          <button
            onClick={undo}
            className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm text-[#cfd6e2] hover:border-[var(--color-accent)]"
          >
            Undo ({edits.length})
          </button>
        )}

        {rows.length > 0 && file && (
          <>
            <button
              onClick={() => exportXlsx(rows, flags, file.fileName)}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm font-medium text-[#08131f] hover:brightness-110"
            >
              Export xlsx
            </button>
            <button
              onClick={() => exportCsv(rows, file.fileName)}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm text-[#cfd6e2] hover:border-[var(--color-accent)]"
            >
              csv
            </button>
            <button
              onClick={() => exportJson(rows, flags, file.fileName)}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm text-[#cfd6e2] hover:border-[var(--color-accent)]"
            >
              json
            </button>
          </>
        )}

        <button
          onClick={reset}
          className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm text-[var(--color-muted)] hover:text-white"
        >
          New file
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good"
      ? "text-[var(--color-good)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "bad"
          ? "text-[var(--color-bad)]"
          : "text-white";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p className={`text-base font-medium tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function Timeline() {
  const timeline = useRun((s) => s.timeline);
  if (!timeline.length) return null;

  return (
    <div className="max-h-[120px] overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 font-mono text-[12px]">
      {timeline.map((entry, i) => (
        <div
          key={`${entry.at}-${i}`}
          className={
            entry.kind === "warn"
              ? "text-[var(--color-warn)]"
              : entry.kind === "good"
                ? "text-[var(--color-good)]"
                : "text-[var(--color-muted)]"
          }
        >
          <span className="text-[#4d545f]">
            {new Date(entry.at).toLocaleTimeString("en-US", { hour12: false })}{" "}
          </span>
          {entry.message}
        </div>
      ))}
    </div>
  );
}

export function ChaosControls() {
  const chaosDrop = useRun((s) => s.chaosDrop);
  const chaosTruncate = useRun((s) => s.chaosTruncate);
  const setChaos = useRun((s) => s.setChaos);

  return (
    <div className="flex items-center gap-4 text-[12px] text-[var(--color-muted)]">
      <span className="uppercase tracking-wider">Break it on purpose</span>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={chaosDrop}
          onChange={(e) => setChaos("drop", e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        drop the connection mid-stream
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={chaosTruncate}
          onChange={(e) => setChaos("truncate", e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        truncate at the token limit
      </label>
    </div>
  );
}
