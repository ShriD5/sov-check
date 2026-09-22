import { useMemo, useState } from "react";
import { mapHeaders } from "../lib/mapHeaders.js";
import { FIELDS } from "../lib/schema.js";
import { useRun } from "../store/runStore.js";
import type { ColumnMapping, FieldId } from "../lib/types.js";

const VIA_LABEL: Record<ColumnMapping["via"], string> = {
  exact: "exact match",
  synonym: "synonym",
  fuzzy: "fuzzy match",
  llm: "model",
  manual: "you set this",
  unmapped: "not mapped",
};

function confidenceTone(confidence: number, field: FieldId | null): string {
  if (!field) return "text-[var(--color-muted)]";
  if (confidence >= 0.9) return "text-[var(--color-good)]";
  if (confidence >= 0.75) return "text-[#cfd6e2]";
  return "text-[var(--color-warn)]";
}

export function MappingPanel() {
  const file = useRun((s) => s.file);
  const start = useRun((s) => s.start);
  const reset = useRun((s) => s.reset);

  const initial = useMemo(() => (file ? mapHeaders(file.headers, file.rows) : []), [file]);
  const [mappings, setMappings] = useState<ColumnMapping[]>(initial);

  if (!file) return null;

  const mapped = mappings.filter((m) => m.field).length;
  const needsReview = mappings.filter((m) => !m.field && m.confidence > 0 && m.confidence < 0.6);

  const setField = (header: string, field: FieldId | null) => {
    setMappings((current) =>
      current.map((m) => {
        if (m.header === header) return { ...m, field, via: "manual", confidence: field ? 1 : 0 };
        if (field && m.field === field) return { ...m, field: null, via: "unmapped", confidence: 0 };
        return m;
      }),
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-20">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Check the column mapping</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {file.fileName} &middot; {file.rows.length} rows &middot; {mapped} of {mappings.length} columns mapped
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-white"
          >
            Start over
          </button>
          <button
            onClick={() => void start(file, mappings)}
            className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[#08131f] hover:brightness-110"
          >
            Build the schedule
          </button>
        </div>
      </div>

      {file.notes.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-sm text-[var(--color-muted)]">
          {file.notes.map((note) => (
            <li key={note}>&middot; {note}</li>
          ))}
        </ul>
      )}

      {needsReview.length > 0 && (
        <p className="mt-4 rounded-lg border border-[var(--color-warn)]/40 bg-[#241d10] p-3 text-sm text-[var(--color-warn)]">
          {needsReview.length} column{needsReview.length > 1 ? "s" : ""} could not be matched with
          confidence. They are unmapped rather than guessed. Set them below if they matter.
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-lg border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead className="bg-[#10141a] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Column in your file</th>
              <th className="px-4 py-2.5 font-medium">Mapped to</th>
              <th className="px-4 py-2.5 font-medium">How</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr key={mapping.header} className="border-t border-[var(--color-line)] bg-[var(--color-panel)]">
                <td className="px-4 py-2 font-mono text-[13px] text-[#cfd6e2]">
                  {mapping.header}
                  {mapping.scale ? (
                    <span className="ml-2 rounded bg-[#1d2733] px-1.5 py-0.5 text-[11px] text-[var(--color-accent)]">
                      x{mapping.scale.toLocaleString()}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={mapping.field ?? ""}
                    onChange={(e) => setField(mapping.header, (e.target.value || null) as FieldId | null)}
                    className="w-full rounded border border-[var(--color-line)] bg-[#0f1319] px-2 py-1 text-[13px] text-white"
                  >
                    <option value="">— ignore —</option>
                    {FIELDS.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`px-4 py-2 text-[13px] ${confidenceTone(mapping.confidence, mapping.field)}`}>
                  {VIA_LABEL[mapping.via]}
                  {mapping.field ? ` · ${Math.round(mapping.confidence * 100)}%` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
