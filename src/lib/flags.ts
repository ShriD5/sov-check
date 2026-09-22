import { COPE_FIELDS, FIELD_BY_ID, US_STATES } from "./schema";
import type { ColumnMapping, Flag, LocationRow } from "./types";

const CURRENT_YEAR = new Date().getFullYear();

function fuzzyAddressKey(row: LocationRow): string | null {
  const address = row.address.value;
  if (typeof address !== "string" || !address) return null;
  const street = address
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|suite|ste|unit|#)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  const zip = typeof row.zip.value === "string" ? row.zip.value.slice(0, 5) : "";
  return street ? `${street}|${zip}` : null;
}

/** Flags for a single row. Duplicates need the whole set, so they run separately. */
export function flagRow(row: LocationRow, mappings: ColumnMapping[]): Flag[] {
  const flags: Flag[] = [];
  const push = (f: Omit<Flag, "id" | "rowKey">) =>
    flags.push({ ...f, id: `${row.key}:${f.code}:${f.field ?? "row"}`, rowKey: row.key });

  for (const field of COPE_FIELDS) {
    if (row[field].value === null) {
      push({
        field,
        level: "warn",
        code: "missing_cope",
        message: `${FIELD_BY_ID[field].label} is missing`,
      });
    }
  }

  const building = row.building_value.value;
  const contents = row.contents_value.value;
  const bi = row.bi_value.value;
  const tiv = row.tiv.value;

  if (typeof tiv === "number" && row.tiv.raw !== "(derived)") {
    const parts = [building, contents, bi].filter((v): v is number => typeof v === "number");
    if (parts.length >= 2) {
      const sum = parts.reduce((a, b) => a + b, 0);
      const drift = Math.abs(sum - tiv);
      const tolerance = Math.max(1, Math.abs(tiv) * 0.005);
      if (drift > tolerance) {
        push({
          field: "tiv",
          level: "error",
          code: "tiv_mismatch",
          message: `TIV ${fmt(tiv)} does not equal building + contents + BI (${fmt(sum)}), off by ${fmt(drift)}`,
        });
      }
    }
  }

  if (tiv === null) {
    push({ field: "tiv", level: "error", code: "no_tiv", message: "No TIV and no values to derive it from" });
  }

  const year = row.year_built.value;
  if (typeof year === "number" && (year < 1700 || year > CURRENT_YEAR + 1)) {
    push({
      field: "year_built",
      level: "error",
      code: "year_out_of_range",
      message: `Year built ${year} is outside 1700-${CURRENT_YEAR + 1}`,
    });
  }

  const state = row.state.value;
  if (typeof state === "string" && state && !US_STATES.has(state)) {
    push({ field: "state", level: "warn", code: "bad_state", message: `"${state}" is not a US state code` });
  }

  const zip = row.zip.value;
  if (typeof zip === "string" && zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    push({ field: "zip", level: "warn", code: "bad_zip", message: `"${zip}" is not a 5 or 9 digit zip` });
  }

  // A sq ft number that small is almost always square metres or thousands.
  const sqFt = row.sq_ft.value;
  if (typeof sqFt === "number" && sqFt > 0 && sqFt < 400) {
    push({
      field: "sq_ft",
      level: "warn",
      code: "unit_ambiguous",
      message: `${sqFt} sq ft is implausibly small, check for square metres or thousands`,
    });
  }

  for (const mapping of mappings) {
    if (!mapping.field) continue;
    if (mapping.confidence < 0.8 && row[mapping.field].value !== null) {
      push({
        field: mapping.field,
        level: "info",
        code: "low_confidence_mapping",
        message: `"${mapping.header}" mapped to ${FIELD_BY_ID[mapping.field].label} at ${Math.round(mapping.confidence * 100)}% confidence`,
      });
    }
  }

  return flags;
}

/** Cross-row duplicate detection. Run once the full set is in. */
export function flagDuplicates(rows: LocationRow[]): Flag[] {
  const seen = new Map<string, string>();
  const flags: Flag[] = [];

  for (const row of rows) {
    const key = fuzzyAddressKey(row);
    if (!key) continue;
    const first = seen.get(key);
    if (first) {
      flags.push({
        id: `${row.key}:duplicate_location:address`,
        rowKey: row.key,
        field: "address",
        level: "warn",
        code: "duplicate_location",
        message: `Looks like a duplicate of an earlier location at the same address`,
      });
    } else {
      seen.set(key, row.key);
    }
  }

  return flags;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function summarize(rows: LocationRow[], flags: Flag[]) {
  const tiv = rows.reduce((sum, r) => sum + (typeof r.tiv.value === "number" ? r.tiv.value : 0), 0);
  const copeCells = rows.length * COPE_FIELDS.length;
  const copeFilled = rows.reduce(
    (n, r) => n + COPE_FIELDS.filter((f) => r[f].value !== null).length,
    0,
  );
  return {
    locations: rows.length,
    tiv,
    copeCompleteness: copeCells ? copeFilled / copeCells : 0,
    errors: flags.filter((f) => f.level === "error").length,
    warnings: flags.filter((f) => f.level === "warn").length,
  };
}
