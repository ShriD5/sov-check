import { COPE_FIELDS, FIELD_BY_ID, US_STATES, ZIP_PREFIX_STATES } from "./schema.js";
import type { ColumnMapping, Flag, LocationRow, Reconciliation, SourceSubtotal } from "./types.js";

const CURRENT_YEAR = new Date().getFullYear();

function norm(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

/**
 * A duplicate is the same building listed twice, not two buildings on one
 * campus. The Town of Ware lists a high school, a press box, a concession
 * stand and field lights all at 237 West Street; keying on address alone
 * called all of them duplicates. Address plus building number plus
 * description is what identifies a building.
 */
function duplicateKey(row: LocationRow): string | null {
  const address = row.address.value;
  if (typeof address !== "string" || !address) return null;
  const street = address
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|suite|ste|unit|#)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!street) return null;
  const zip = typeof row.zip.value === "string" ? row.zip.value.slice(0, 5) : "";
  return [
    street,
    zip,
    norm(row.location_id.value),
    norm(row.building_id.value),
    norm(row.description.value),
    norm(row.sq_ft.value),
    norm(row.building_value.value),
  ].join("|");
}

/** Flags for a single row. Duplicates need the whole set, so they run separately. */
export function flagRow(row: LocationRow, mappings: ColumnMapping[]): Flag[] {
  const flags: Flag[] = [];
  const push = (f: Omit<Flag, "id" | "rowKey">) =>
    flags.push({ ...f, id: `${row.key}:${f.code}:${f.field ?? "row"}`, rowKey: row.key });

  // A COPE field the file never had is one fact about the file, reported once
  // by flagAcrossRows. Per row, only flag a blank in a column that exists.
  const mapped = new Set(mappings.map((m) => m.field));
  for (const field of COPE_FIELDS) {
    if (mapped.has(field) && row[field].value === null) {
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
  } else if (tiv === 0) {
    push({ field: "tiv", level: "warn", code: "zero_tiv", message: "Listed with a TIV of zero" });
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
  } else if (typeof zip === "string" && typeof state === "string" && US_STATES.has(state)) {
    const allowed = ZIP_PREFIX_STATES[zip[0]];
    if (allowed && !allowed.includes(state)) {
      push({
        field: "zip",
        level: "error",
        code: "zip_state_mismatch",
        message: `Zip ${zip} is not in ${state}; zips starting with ${zip[0]} belong to ${allowed.slice(0, 4).join(", ")}${allowed.length > 4 ? "..." : ""}`,
      });
    }
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

/** Minimum rows with both area and value before a schedule median means anything. */
const PSF_MIN_SAMPLE = 8;
/** How many times the schedule's own median $/sq ft counts as an outlier. */
const PSF_OUTLIER_MULTIPLE = 10;

/**
 * Checks that need the whole schedule. Run once the full set is in.
 *
 * Value per square foot is judged against this schedule's own median rather
 * than a fixed number. A fixed "under 400 sq ft is suspicious" rule fired 819
 * times on the State of Mississippi's SOV, almost all of them real sheds,
 * silos and pavilions. Relative to the schedule, the same file surfaces a
 * 96 sq ft guard office carrying $3.6M, which is the row worth a question.
 */
export function flagAcrossRows(rows: LocationRow[], mappings: ColumnMapping[] = []): Flag[] {
  const flags: Flag[] = [];
  const seen = new Map<string, string>();

  // Reported once for the whole file. The Mississippi SOV has no year built,
  // construction or sprinkler column at all; listing that as 11,861 row-level
  // warnings buried the 217 rows that actually needed a look.
  if (rows.length && mappings.length) {
    const mapped = new Set(mappings.map((m) => m.field));
    const absent = COPE_FIELDS.filter((f) => !mapped.has(f)).map((f) => FIELD_BY_ID[f].label);
    if (absent.length) {
      flags.push({
        id: `file:cope_not_in_file`,
        rowKey: rows[0].key,
        field: null,
        level: "info",
        code: "cope_not_in_file",
        message: `Not in this file at all: ${absent.join(", ")}. Every location needs these from another source.`,
      });
    }
  }

  for (const row of rows) {
    const key = duplicateKey(row);
    if (!key) continue;
    if (seen.has(key)) {
      flags.push({
        id: `${row.key}:duplicate_location:address`,
        rowKey: row.key,
        field: "address",
        level: "warn",
        code: "duplicate_location",
        message: "Identical to an earlier row: same address, description, area and value",
      });
    } else {
      seen.set(key, row.key);
    }
  }

  const densities = rows
    .map((row) => ({ row, sq: row.sq_ft.value, value: row.building_value.value }))
    .filter(
      (x): x is { row: LocationRow; sq: number; value: number } =>
        typeof x.sq === "number" && x.sq > 0 && typeof x.value === "number" && x.value > 0,
    )
    .map((x) => ({ ...x, psf: x.value / x.sq }));

  if (densities.length >= PSF_MIN_SAMPLE) {
    const sorted = densities.map((d) => d.psf).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ceiling = median * PSF_OUTLIER_MULTIPLE;

    for (const d of densities) {
      if (d.psf <= ceiling) continue;
      flags.push({
        id: `${d.row.key}:psf_outlier:sq_ft`,
        rowKey: d.row.key,
        field: "sq_ft",
        level: "warn",
        code: "psf_outlier",
        message: `$${fmt(d.psf)}/sq ft is ${Math.round(d.psf / median)}x this schedule's median ($${fmt(median)}); check the area or the value`,
      });
    }
  }

  return flags;
}

/** Tolerance for tying a schedule sum to a printed total: rounding, not error. */
const TIE_OUT_TOLERANCE = 1.01;

/**
 * Ties the extracted schedule out against totals the source printed about
 * itself. Each printed total closes a block of rows; if the block's TIV,
 * building or contents sum equals one of the printed figures to the dollar,
 * the extraction reproduced the document's own arithmetic.
 */
export function reconcile(
  rows: LocationRow[],
  subtotals: SourceSubtotal[] | undefined,
): { results: Reconciliation[]; flags: Flag[] } {
  const results: Reconciliation[] = [];
  const flags: Flag[] = [];
  if (!subtotals?.length) return { results, flags };

  const sum = (block: LocationRow[], field: "tiv" | "building_value" | "contents_value") =>
    block.reduce((total, r) => total + (typeof r[field].value === "number" ? (r[field].value as number) : 0), 0);

  for (const subtotal of subtotals) {
    const block = rows.slice(subtotal.startRow, subtotal.endRow);
    if (!block.length) continue;

    const sums = {
      tiv: sum(block, "tiv"),
      building_value: sum(block, "building_value"),
      contents_value: sum(block, "contents_value"),
    };

    let matched: Reconciliation["matched"] = null;
    let sourceAmount = Math.max(...subtotal.amounts);
    let scheduleAmount = sums.tiv;

    outer: for (const field of ["tiv", "building_value", "contents_value"] as const) {
      for (const amount of subtotal.amounts) {
        if (Math.abs(amount - sums[field]) <= TIE_OUT_TOLERANCE) {
          matched = field;
          sourceAmount = amount;
          scheduleAmount = sums[field];
          break outer;
        }
      }
    }

    const result: Reconciliation = {
      label: subtotal.label,
      where: subtotal.where,
      rows: block.length,
      matched,
      sourceAmount,
      scheduleAmount,
      diff: scheduleAmount - sourceAmount,
    };
    results.push(result);

    if (!matched) {
      flags.push({
        id: `${block[0].key}:subtotal_mismatch:${subtotal.where}`,
        rowKey: block[0].key,
        field: "tiv",
        level: "error",
        code: "subtotal_mismatch",
        message: `"${subtotal.label}" prints ${fmt(sourceAmount)} (${subtotal.where}); the ${block.length} rows above it sum to ${fmt(sums.tiv)} TIV`,
      });
    }
  }

  return { results, flags };
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
