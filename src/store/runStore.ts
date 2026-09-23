import { create } from "zustand";
import { streamRun, type StreamHandle } from "../lib/sseClient.js";
import { flagAcrossRows, flagRow, reconcile, summarize } from "../lib/flags.js";
import { hydrateRow, type WireRow } from "../lib/wire.js";
import type {
  Cell,
  ColumnMapping,
  FieldId,
  Flag,
  LocationRow,
  ParsedFile,
  Reconciliation,
  SourceSubtotal,
} from "../lib/types.js";

export type Phase =
  | "idle"
  | "parsing"
  | "mapping"
  | "streaming"
  | "interrupted"
  | "done"
  | "error";

interface TimelineEntry {
  at: number;
  kind: "info" | "warn" | "good";
  message: string;
}

interface Edit {
  rowKey: string;
  field: FieldId;
  before: Cell;
  after: Cell;
}

interface RunState {
  phase: Phase;
  file: ParsedFile | null;
  mappings: ColumnMapping[];
  rows: LocationRow[];
  flags: Flag[];
  reconciliation: Reconciliation[];
  total: number;
  error: string | null;
  timeline: TimelineEntry[];
  selected: { rowKey: string; field: FieldId } | null;
  edits: Edit[];
  chaosDrop: boolean;
  chaosTruncate: boolean;
  pendingFile: File | null;
  handle: StreamHandle | null;

  setChaos(kind: "drop" | "truncate", on: boolean): void;
  start(parsed: ParsedFile, mappings?: ColumnMapping[]): Promise<void>;
  setPendingFile(file: File | null): void;
  setPhase(phase: Phase): void;
  setParsed(parsed: ParsedFile): void;
  cancel(): void;
  select(rowKey: string, field: FieldId): void;
  clearSelection(): void;
  editCell(rowKey: string, field: FieldId, nextValue: string): void;
  undo(): void;
  remap(header: string, field: FieldId | null): void;
  reset(): void;
}

function log(kind: TimelineEntry["kind"], message: string): TimelineEntry {
  return { at: Date.now(), kind, message };
}

/** Flags and tie-out after an edit, so fixing a cell can fix (or break) a reconciliation. */
function recompute(rows: LocationRow[], mappings: ColumnMapping[], subtotals?: SourceSubtotal[]) {
  const tieOut = reconcile(rows, subtotals);
  return {
    flags: [...rows.flatMap((r) => flagRow(r, mappings)), ...flagAcrossRows(rows, mappings), ...tieOut.flags],
    reconciliation: tieOut.results,
  };
}

function coerce(field: FieldId, text: string, previous: Cell): Cell {
  const trimmed = text.trim();
  if (trimmed === "")
    return {
      ...previous,
      value: null,
      raw: trimmed,
      edited: true,
      confidence: 1,
    };

  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  const looksNumeric = Number.isFinite(numeric) && /[\d]/.test(trimmed);
  const isMoneyish = [
    "building_value",
    "contents_value",
    "bi_value",
    "tiv",
    "sq_ft",
    "stories",
    "year_built",
    "roof_year",
  ].includes(field);

  return {
    ...previous,
    value: isMoneyish && looksNumeric ? numeric : trimmed,
    raw: trimmed,
    edited: true,
    confidence: 1,
  };
}

export const useRun = create<RunState>((set, get) => ({
  phase: "idle",
  file: null,
  mappings: [],
  rows: [],
  flags: [],
  reconciliation: [],
  total: 0,
  error: null,
  timeline: [],
  selected: null,
  edits: [],
  chaosDrop: false,
  chaosTruncate: false,
  pendingFile: null,
  handle: null,

  setChaos: (kind, on) =>
    set(kind === "drop" ? { chaosDrop: on } : { chaosTruncate: on }),

  setPendingFile: (file) => set({ pendingFile: file }),
  setPhase: (phase) => set({ phase }),
  setParsed: (parsed) =>
    set({
      file: parsed,
      phase: "mapping",
      rows: [],
      flags: [],
      edits: [],
      error: null,
      selected: null,
      timeline: [
        log(
          "info",
          `Parsed ${parsed.rows.length} rows from ${parsed.fileName}`,
        ),
      ],
    }),

  async start(parsed, mappings) {
    get().handle?.cancel("superseded");

    set({
      phase: "streaming",
      file: parsed,
      rows: [],
      flags: [],
      reconciliation: [],
      edits: [],
      error: null,
      total: parsed.rows.length,
      timeline: [
        ...get().timeline,
        log("info", `Extracting ${parsed.rows.length} rows`),
      ],
    });

    // Rows arrive faster than a browser should re-render. Buffer them and
    // commit once per frame: 3,861 rows become a few dozen renders instead of
    // 3,861, and appending stays linear instead of copying the array each time.
    let pending: LocationRow[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      set((state) => ({ rows: state.rows.concat(batch) }));
    };
    const queueRow = (row: LocationRow) => {
      pending.push(row);
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const flushNow = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
    };

    const handle = streamRun(
      {
        fileName: parsed.fileName,
        kind: parsed.kind,
        headers: parsed.headers,
        rows: parsed.rows,
        mappings,
        subtotals: parsed.subtotals,
        chaosDropAfter: get().chaosDrop
          ? Math.ceil(parsed.rows.length / 3)
          : undefined,
        chaosTruncateAfter: get().chaosTruncate
          ? Math.ceil(parsed.rows.length / 2)
          : undefined,
      },
      {
        onEvent: (event) => {
          if (event.type === "mapping") {
            set({ mappings: event.mappings });
            return;
          }
          if (event.type === "row") {
            queueRow(hydrateRow(event.row as WireRow));
            if (get().total !== event.total) set({ total: event.total });
            return;
          }
          if (event.type === "flags") {
            flushNow();
            set({ flags: event.flags });
            return;
          }
          if (event.type === "reconciliation") {
            const tied = event.results.filter((r) => r.matched).length;
            set((state) => ({
              reconciliation: event.results,
              timeline: [
                ...state.timeline,
                log(
                  tied === event.results.length ? "good" : "warn",
                  `Tied out ${tied} of ${event.results.length} totals printed in the source`,
                ),
              ],
            }));
          }
        },
        onInterrupt: ({ lastEventId, attempt, reason }) => {
          // Bank what arrived before the drop so the count in the log is true.
          flushNow();
          set((state) => ({
            phase: "interrupted",
            timeline: [
              ...state.timeline,
              log(
                "warn",
                `${reason}. Retry ${attempt} from event ${lastEventId}, ${state.rows.length} rows already banked.`,
              ),
            ],
          }));
        },
        onResume: ({ lastEventId }) =>
          set((state) => ({
            phase: "streaming",
            timeline: [
              ...state.timeline,
              log("good", `Resumed at event ${lastEventId}, no rows re-sent`),
            ],
          })),
        onDone: () => {
          flushNow();
          set((state) => ({
            phase: "done",
            timeline: [
              ...state.timeline,
              log("good", `Schedule complete, ${state.rows.length} locations`),
            ],
          }));
        },
        onFatal: (message) => {
          flushNow();
          set((state) => ({
            phase: "error",
            error: message,
            timeline: [...state.timeline, log("warn", message)],
          }));
        },
      },
    );

    set({ handle });
  },

  cancel() {
    get().handle?.cancel("user cancelled");
    set((state) => ({
      phase: "idle",
      handle: null,
      timeline: [...state.timeline, log("warn", "Run cancelled")],
    }));
  },

  select: (rowKey, field) => set({ selected: { rowKey, field } }),
  clearSelection: () => set({ selected: null }),

  editCell(rowKey, field, nextValue) {
    const state = get();
    const row = state.rows.find((r) => r.key === rowKey);
    if (!row) return;

    const before = row[field];
    const after = coerce(field, nextValue, before);

    const rows = state.rows.map((r) =>
      r.key === rowKey ? { ...r, [field]: after } : r,
    );
    const { flags, reconciliation } = recompute(rows, state.mappings, state.file?.subtotals);

    set({
      rows,
      flags,
      reconciliation,
      edits: [...state.edits, { rowKey, field, before, after }],
    });
  },

  undo() {
    const state = get();
    const last = state.edits[state.edits.length - 1];
    if (!last) return;

    const rows = state.rows.map((r) =>
      r.key === last.rowKey ? { ...r, [last.field]: last.before } : r,
    );
    const { flags, reconciliation } = recompute(rows, state.mappings, state.file?.subtotals);

    set({ rows, flags, reconciliation, edits: state.edits.slice(0, -1) });
  },

  remap(header, field) {
    set((state) => ({
      mappings: state.mappings.map((m) =>
        m.header === header
          ? { ...m, field, via: "manual", confidence: field ? 1 : 0 }
          : m.field === field && field !== null
            ? { ...m, field: null, via: "unmapped", confidence: 0 }
            : m,
      ),
    }));
  },

  reset() {
    get().handle?.cancel("reset");
    set({
      phase: "idle",
      file: null,
      mappings: [],
      rows: [],
      flags: [],
      reconciliation: [],
      total: 0,
      error: null,
      timeline: [],
      selected: null,
      edits: [],
      pendingFile: null,
      handle: null,
    });
  },
}));

export function useSummary() {
  const rows = useRun((s) => s.rows);
  const flags = useRun((s) => s.flags);
  return summarize(rows, flags);
}
