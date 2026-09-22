/** Where a value came from in the uploaded file. Every extracted cell carries one. */
export type SourceRef =
  | { kind: "sheet"; sheet: string; row: number; col: number; a1: string }
  | { kind: "pdf"; page: number; line: number };

export type FieldId =
  | "location_id"
  | "building_id"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "country"
  | "year_built"
  | "stories"
  | "sq_ft"
  | "construction"
  | "occupancy"
  | "sprinklered"
  | "roof_type"
  | "roof_year"
  | "protection_class"
  | "building_value"
  | "contents_value"
  | "bi_value"
  | "tiv"
  | "currency";

export type FieldKind = "string" | "number" | "money" | "year" | "bool" | "enum";

export interface FieldDef {
  id: FieldId;
  label: string;
  kind: FieldKind;
  group: "identity" | "location" | "cope" | "values";
  /** COPE completeness counts these. */
  cope?: boolean;
}

/** A single normalized value plus the provenance needed to defend it. */
export interface Cell<T = string | number | boolean | null> {
  value: T;
  raw: string;
  source: SourceRef | null;
  /** 0..1. Derived from header-mapping confidence and value coercion cleanliness. */
  confidence: number;
  /** Set when a human edited the value in the grid. */
  edited?: boolean;
}

export type LocationRow = {
  /** Stable key used for stream dedupe and continuation. */
  key: string;
} & { [K in FieldId]: Cell };

export type FlagLevel = "error" | "warn" | "info";

export interface Flag {
  id: string;
  rowKey: string;
  field: FieldId | null;
  level: FlagLevel;
  code:
    | "missing_cope"
    | "tiv_mismatch"
    | "duplicate_location"
    | "year_out_of_range"
    | "bad_state"
    | "bad_zip"
    | "unit_ambiguous"
    | "low_confidence_mapping"
    | "no_tiv";
  message: string;
}

/** One physical row of the uploaded file, before normalization. */
export interface RawRow {
  index: number;
  sheet: string;
  /** Header label -> raw cell text. */
  cells: Record<string, string>;
  /** Header label -> source ref for that cell. */
  refs: Record<string, SourceRef>;
}

export interface ColumnMapping {
  header: string;
  field: FieldId | null;
  confidence: number;
  /** How the mapping was decided. Shown in the UI so nothing is magic. */
  via: "exact" | "synonym" | "fuzzy" | "llm" | "manual" | "unmapped";
  /** Multiplier applied to numeric values, e.g. 1000 for a "$000s" header. */
  scale?: number;
}

export interface ParsedFile {
  fileName: string;
  kind: "xlsx" | "csv" | "pdf";
  sheets: string[];
  headers: string[];
  rows: RawRow[];
  /** Notes surfaced to the user, e.g. "merged header rows collapsed". */
  notes: string[];
}

/** Server-sent event payloads. */
export type StreamEvent =
  | { type: "mapping"; mappings: ColumnMapping[] }
  | { type: "row"; row: LocationRow; index: number; total: number }
  | { type: "flags"; flags: Flag[] }
  | { type: "done"; emitted: number; total: number }
  | { type: "error"; message: string; retryable: boolean };

export interface ExtractRequest {
  fileName: string;
  kind: ParsedFile["kind"];
  headers: string[];
  rows: RawRow[];
  /** Present when the user confirmed or corrected the mapping. */
  mappings?: ColumnMapping[];
  /** Dev/demo only: make the server drop the stream after N rows. */
  chaosDropAfter?: number;
  /** Dev/demo only: make the server truncate its own output after N rows. */
  chaosTruncateAfter?: number;
}
