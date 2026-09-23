import { FIELD_IDS } from "./schema.js";
import type { Cell, LocationRow } from "./types.js";

/** A row on the wire: only the cells that carry something. */
export type WireRow = { key: string } & Partial<LocationRow>;

function isEmpty(cell: Cell): boolean {
  return cell.value === null && cell.raw === "" && cell.source === null;
}

/**
 * Drops empty cells before a row goes over SSE. A public-entity SOV leaves
 * half the schedule blank (no year built, no construction class), and sending
 * twenty-two full cell objects per building doubled the stream for the
 * Mississippi file. The client puts the blanks back.
 */
export function compactRow(row: LocationRow): WireRow {
  const out: WireRow = { key: row.key };
  for (const field of FIELD_IDS) {
    if (!isEmpty(row[field])) (out as Record<string, unknown>)[field] = row[field];
  }
  return out;
}

export function hydrateRow(wire: WireRow): LocationRow {
  const row = { key: wire.key } as LocationRow;
  for (const field of FIELD_IDS) {
    row[field] = (wire[field] as Cell | undefined) ?? { value: null, raw: "", source: null, confidence: 0 };
  }
  return row;
}
