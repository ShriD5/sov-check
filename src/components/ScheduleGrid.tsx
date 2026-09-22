import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FIELDS } from "../lib/schema.js";
import { useRun } from "../store/runStore.js";
import type { Cell, FieldId, LocationRow } from "../lib/types.js";

const COL_WIDTH: Partial<Record<FieldId, number>> = {
  location_id: 70,
  building_id: 70,
  address: 210,
  city: 120,
  state: 60,
  zip: 80,
  country: 70,
  construction: 170,
  occupancy: 140,
  roof_type: 110,
  building_value: 120,
  contents_value: 120,
  bi_value: 110,
  tiv: 130,
};

const ROW_HEIGHT = 34;

function format(cell: Cell, field: FieldId): string {
  if (cell.value === null) return "";
  if (typeof cell.value === "boolean") return cell.value ? "Yes" : "No";
  if (typeof cell.value === "number") {
    const money = ["building_value", "contents_value", "bi_value", "tiv"].includes(field);
    if (money) return cell.value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (["year_built", "roof_year"].includes(field)) return String(cell.value);
    return cell.value.toLocaleString("en-US");
  }
  return String(cell.value);
}

export function ScheduleGrid() {
  const rows = useRun((s) => s.rows);
  const flags = useRun((s) => s.flags);
  const select = useRun((s) => s.select);
  const selected = useRun((s) => s.selected);
  const editCell = useRun((s) => s.editCell);

  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ rowKey: string; field: FieldId } | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const flagIndex = new Map<string, "error" | "warn" | "info">();
  for (const flag of flags) {
    if (!flag.field) continue;
    const key = `${flag.rowKey}:${flag.field}`;
    const current = flagIndex.get(key);
    if (current === "error") continue;
    if (current === "warn" && flag.level !== "error") continue;
    flagIndex.set(key, flag.level);
  }

  const totalWidth = FIELDS.reduce((w, f) => w + (COL_WIDTH[f.id] ?? 100), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: totalWidth }}>
          <div className="sticky top-0 z-10 flex border-b border-[var(--color-line)] bg-[#10141a] text-xs uppercase tracking-wider text-[var(--color-muted)]">
            {FIELDS.map((field) => (
              <div
                key={field.id}
                style={{ width: COL_WIDTH[field.id] ?? 100 }}
                className="shrink-0 px-2.5 py-2 font-medium"
              >
                {field.label}
              </div>
            ))}
          </div>

          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row: LocationRow = rows[virtualRow.index];
              return (
                <div
                  key={row.key}
                  className="absolute left-0 flex border-b border-[#1c2027] text-[13px] hover:bg-[#151a21]"
                  style={{ top: virtualRow.start, height: ROW_HEIGHT, width: totalWidth }}
                >
                  {FIELDS.map((field) => {
                    const cell = row[field.id];
                    const level = flagIndex.get(`${row.key}:${field.id}`);
                    const isSelected =
                      selected?.rowKey === row.key && selected.field === field.id;
                    const isEditing =
                      editing?.rowKey === row.key && editing.field === field.id;

                    return (
                      <div
                        key={field.id}
                        style={{ width: COL_WIDTH[field.id] ?? 100 }}
                        onClick={() => select(row.key, field.id)}
                        onDoubleClick={() => setEditing({ rowKey: row.key, field: field.id })}
                        className={`shrink-0 cursor-pointer truncate border-r border-[#1c2027] px-2.5 py-1.5 ${
                          isSelected ? "bg-[#1b2a3c] ring-1 ring-inset ring-[var(--color-accent)]" : ""
                        } ${
                          level === "error"
                            ? "text-[var(--color-bad)]"
                            : level === "warn"
                              ? "text-[var(--color-warn)]"
                              : cell.value === null
                                ? "text-[#4d545f]"
                                : "text-[#dbe1ea]"
                        } ${cell.edited ? "italic underline decoration-dotted" : ""}`}
                        title={cell.raw ? `raw: ${cell.raw}` : undefined}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            defaultValue={cell.value === null ? "" : String(cell.value)}
                            onBlur={(e) => {
                              editCell(row.key, field.id, e.target.value);
                              setEditing(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="w-full bg-transparent text-white outline-none"
                          />
                        ) : (
                          format(cell, field.id) || <span className="text-[#3c424c]">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
