import * as XLSX from "xlsx";
import type { ParsedFile, RawRow, SourceRef } from "../types.js";

/** Rows we scan looking for the real header row before giving up. */
const HEADER_SEARCH_DEPTH = 12;
const MIN_HEADER_HITS = 3;

const HEADER_WORDS =
  /\b(loc|location|bldg|building|address|city|state|zip|tiv|value|year|constr|construction|occupancy|sprinkler|sq\s?ft|contents|premises|site)\b/i;

type Matrix = (string | number | boolean | null)[][];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Y" : "N";
  return String(v).trim();
}

/**
 * Finds the header row in a sheet that may open with a title block, a logo
 * row, blank rows, or a two-tier merged header.
 */
function findHeaderRow(matrix: Matrix): number {
  let best = { index: 0, hits: 0 };

  for (let r = 0; r < Math.min(HEADER_SEARCH_DEPTH, matrix.length); r++) {
    const row = matrix[r] ?? [];
    const texts = row.map(cellText).filter(Boolean);
    if (texts.length < MIN_HEADER_HITS) continue;
    const hits = texts.filter((t) => HEADER_WORDS.test(t)).length;
    if (hits > best.hits) best = { index: r, hits };
  }

  return best.hits >= MIN_HEADER_HITS ? best.index : 0;
}

/**
 * Collapses a two-tier header. When the row under the header has no data
 * values but does have labels, it is treated as a sub-header and joined:
 * "Values" over "Building" becomes "Values Building".
 */
function buildHeaders(matrix: Matrix, headerRow: number): { headers: string[]; dataStart: number; merged: boolean } {
  const top = (matrix[headerRow] ?? []).map(cellText);
  const next = (matrix[headerRow + 1] ?? []).map(cellText);

  const nextLooksLikeData =
    next.filter(Boolean).length > 0 &&
    next.filter((t) => t && /^[\d$(.,-]/.test(t)).length >= Math.max(1, next.filter(Boolean).length / 2);

  const nextHasLabels = next.filter(Boolean).length >= 2 && !nextLooksLikeData;

  if (!nextHasLabels) {
    return { headers: dedupe(top), dataStart: headerRow + 1, merged: false };
  }

  // Forward-fill the top tier across the merged span, then join.
  const filled: string[] = [];
  let carry = "";
  const width = Math.max(top.length, next.length);
  for (let c = 0; c < width; c++) {
    if (top[c]) carry = top[c];
    const sub = next[c] ?? "";
    filled.push([carry, sub].filter(Boolean).join(" ").trim());
  }

  return { headers: dedupe(filled), dataStart: headerRow + 2, merged: true };
}

function dedupe(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = h || `column ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function isBlankRow(row: Matrix[number]): boolean {
  return row.every((c) => cellText(c) === "");
}

/**
 * Subtotal and grand-total rows poison a schedule. They look like data but
 * double count the TIV, so they are dropped and reported in notes.
 */
function isTotalRow(row: Matrix[number]): boolean {
  const texts = row.map(cellText).filter(Boolean);
  if (!texts.length) return false;
  return texts.some((t) => /^(grand\s+)?(total|subtotal|sum)\b/i.test(t.trim()));
}

export function parseWorkbook(buffer: ArrayBuffer, fileName: string): ParsedFile {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const notes: string[] = [];
  const rows: RawRow[] = [];
  const headerUnion: string[] = [];
  let ordinal = 0;
  let droppedTotals = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<Matrix[number]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    }) as unknown as Matrix;

    if (!matrix.length) continue;

    const headerRow = findHeaderRow(matrix);
    const { headers, dataStart, merged } = buildHeaders(matrix, headerRow);

    if (headerRow > 0) {
      notes.push(`${sheetName}: header found on row ${headerRow + 1}, ${headerRow} row(s) above it skipped`);
    }
    if (merged) notes.push(`${sheetName}: two-tier header collapsed`);

    for (const header of headers) if (header && !headerUnion.includes(header)) headerUnion.push(header);

    for (let r = dataStart; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      if (isBlankRow(row)) continue;
      if (isTotalRow(row)) {
        droppedTotals++;
        continue;
      }

      const cells: Record<string, string> = {};
      const refs: Record<string, SourceRef> = {};

      headers.forEach((header, c) => {
        if (!header) return;
        const text = cellText(row[c]);
        cells[header] = text;
        refs[header] = {
          kind: "sheet",
          sheet: sheetName,
          row: r + 1,
          col: c + 1,
          a1: `${XLSX.utils.encode_col(c)}${r + 1}`,
        };
      });

      // A row with no identifying text at all is separator noise.
      if (Object.values(cells).every((v) => v === "")) continue;

      rows.push({ index: ordinal++, sheet: sheetName, cells, refs });
    }
  }

  if (droppedTotals) notes.push(`${droppedTotals} total/subtotal row(s) excluded from the schedule`);
  if (wb.SheetNames.length > 1) notes.push(`${wb.SheetNames.length} sheets combined into one schedule`);

  return {
    fileName,
    kind: fileName.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
    sheets: wb.SheetNames,
    headers: headerUnion,
    rows,
    notes,
  };
}
