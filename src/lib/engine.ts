import { flagDuplicates, flagRow } from "./flags.js";
import { mapHeaders } from "./mapHeaders.js";
import { normalizeRow } from "./normalize.js";
import type { ColumnMapping, ExtractRequest, Flag, LocationRow, StreamEvent } from "./types.js";

export interface EngineResult {
  mappings: ColumnMapping[];
  rows: LocationRow[];
  flags: Flag[];
}

/**
 * The whole extraction, synchronously. The server streams this row by row;
 * the eval harness runs it in one shot. Same code path either way, so what
 * the eval measures is what the app ships.
 */
export function extractAll(req: Pick<ExtractRequest, "headers" | "rows" | "mappings">): EngineResult {
  const mappings = req.mappings?.length ? req.mappings : mapHeaders(req.headers, req.rows);
  const rows = req.rows.map((raw, i) => normalizeRow(raw, mappings, i));
  const flags = [...rows.flatMap((row) => flagRow(row, mappings)), ...flagDuplicates(rows)];
  return { mappings, rows, flags };
}

/**
 * Generates the event sequence for a run. Every event gets a stable, ordered
 * id, which is what makes resume work: a client that died after event 37 asks
 * for 38 onward and gets exactly the events it missed, no duplicates.
 */
export function buildEvents(req: ExtractRequest): StreamEvent[] {
  const { mappings, rows, flags } = extractAll(req);
  const events: StreamEvent[] = [{ type: "mapping", mappings }];

  rows.forEach((row, index) => {
    events.push({ type: "row", row, index, total: rows.length });
  });

  events.push({ type: "flags", flags });
  events.push({ type: "done", emitted: rows.length, total: rows.length });

  return events;
}
