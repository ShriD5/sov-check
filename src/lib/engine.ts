import { flagAcrossRows, flagRow, reconcile } from "./flags.js";
import { mapHeaders } from "./mapHeaders.js";
import { normalizeRow } from "./normalize.js";
import type {
  ColumnMapping,
  ExtractRequest,
  Flag,
  LocationRow,
  Reconciliation,
  StreamEvent,
} from "./types.js";

export interface EngineResult {
  mappings: ColumnMapping[];
  rows: LocationRow[];
  flags: Flag[];
  reconciliation: Reconciliation[];
}

/**
 * The whole extraction, synchronously. The server streams this row by row;
 * the eval harness runs it in one shot. Same code path either way, so what
 * the eval measures is what the app ships.
 */
export function extractAll(
  req: Pick<ExtractRequest, "headers" | "rows" | "mappings" | "subtotals">,
): EngineResult {
  const mappings = req.mappings?.length ? req.mappings : mapHeaders(req.headers, req.rows);
  const rows = req.rows.map((raw, i) => normalizeRow(raw, mappings, i));
  const tieOut = reconcile(rows, req.subtotals);
  const flags = [
    ...rows.flatMap((row) => flagRow(row, mappings)),
    ...flagAcrossRows(rows, mappings),
    ...tieOut.flags,
  ];
  return { mappings, rows, flags, reconciliation: tieOut.results };
}

/**
 * Generates the event sequence for a run. Every event gets a stable, ordered
 * id, which is what makes resume work: a client that died after event 37 asks
 * for 38 onward and gets exactly the events it missed, no duplicates.
 */
export function buildEvents(req: ExtractRequest): StreamEvent[] {
  const { mappings, rows, flags, reconciliation } = extractAll(req);
  const events: StreamEvent[] = [{ type: "mapping", mappings }];

  rows.forEach((row, index) => {
    events.push({ type: "row", row, index, total: rows.length });
  });

  events.push({ type: "flags", flags });
  if (reconciliation.length) events.push({ type: "reconciliation", results: reconciliation });
  events.push({ type: "done", emitted: rows.length, total: rows.length });

  return events;
}
