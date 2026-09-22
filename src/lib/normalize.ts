import { CONSTRUCTION_CLASSES, FIELD_BY_ID, FIELD_IDS, STATE_NAMES, US_STATES } from "./schema";
import { mappingByField } from "./mapHeaders";
import type { Cell, ColumnMapping, LocationRow, RawRow } from "./types";

const EMPTY_TOKENS = new Set(["", "-", "--", "n/a", "na", "none", "null", "tbd", "?", "unknown"]);

function isEmpty(raw: string): boolean {
  return EMPTY_TOKENS.has(raw.trim().toLowerCase());
}

/** "$1,234,567.00", "(1,234)", "1.2M", "1 234" -> number */
export function parseMoney(raw: string): { value: number | null; clean: boolean } {
  const text = raw.trim();
  if (isEmpty(text)) return { value: null, clean: true };

  const negative = /^\(.*\)$/.test(text);
  let body = text.replace(/[()]/g, "").replace(/[$£€₹]/g, "").replace(/\s|,/g, "");

  let multiplier = 1;
  const suffix = body.match(/([kmb])$/i);
  if (suffix) {
    multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffix[1].toLowerCase()] ?? 1;
    body = body.slice(0, -1);
  }

  const num = Number(body);
  if (!Number.isFinite(num)) return { value: null, clean: false };
  return { value: (negative ? -num : num) * multiplier, clean: !suffix };
}

export function parseNumber(raw: string): { value: number | null; clean: boolean } {
  if (isEmpty(raw)) return { value: null, clean: true };
  const num = Number(raw.replace(/[\s,]/g, ""));
  if (!Number.isFinite(num)) return { value: null, clean: false };
  return { value: num, clean: true };
}

export function parseYear(raw: string): { value: number | null; clean: boolean } {
  if (isEmpty(raw)) return { value: null, clean: true };
  const match = raw.match(/(1[5-9]\d{2}|20\d{2}|2100)/);
  if (match) return { value: Number(match[1]), clean: /^\s*\d{4}\s*$/.test(raw) };
  const two = raw.trim().match(/^'?(\d{2})$/);
  if (two) {
    const n = Number(two[1]);
    return { value: n > 30 ? 1900 + n : 2000 + n, clean: false };
  }
  return { value: null, clean: false };
}

export function parseBool(raw: string): { value: boolean | null; clean: boolean } {
  const text = raw.trim().toLowerCase();
  if (isEmpty(text)) return { value: null, clean: true };
  if (["y", "yes", "true", "1", "full", "fully", "100%", "sprinklered", "wet", "dry"].includes(text))
    return { value: true, clean: true };
  if (["n", "no", "false", "0", "none", "unsprinklered", "non-sprinklered"].includes(text))
    return { value: false, clean: true };
  if (text.startsWith("partial")) return { value: true, clean: false };
  return { value: null, clean: false };
}

export function parseConstruction(raw: string): { value: string | null; clean: boolean } {
  const text = raw.trim().toLowerCase();
  if (isEmpty(text)) return { value: null, clean: true };

  const asNumber = Number(text);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 6) {
    const hit = CONSTRUCTION_CLASSES.find((c) => c.code === asNumber)!;
    return { value: `${hit.code} ${hit.label}`, clean: true };
  }

  for (const cls of CONSTRUCTION_CLASSES) {
    if (cls.match.some((m) => text === m)) return { value: `${cls.code} ${cls.label}`, clean: true };
  }
  for (const cls of CONSTRUCTION_CLASSES) {
    if (cls.match.some((m) => text.includes(m))) return { value: `${cls.code} ${cls.label}`, clean: false };
  }
  return { value: raw.trim(), clean: false };
}

export function parseState(raw: string): { value: string | null; clean: boolean } {
  const text = raw.trim();
  if (isEmpty(text)) return { value: null, clean: true };
  const upper = text.toUpperCase();
  if (US_STATES.has(upper)) return { value: upper, clean: true };
  const byName = STATE_NAMES[text.toLowerCase()];
  if (byName) return { value: byName, clean: false };
  return { value: upper, clean: false };
}

export function parseZip(raw: string): { value: string | null; clean: boolean } {
  const text = raw.trim();
  if (isEmpty(text)) return { value: null, clean: true };
  const us = text.match(/^(\d{5})(-\d{4})?$/);
  if (us) return { value: text, clean: true };
  // Excel eats leading zeros on New England zips: 1234 -> 01234
  if (/^\d{4}$/.test(text)) return { value: text.padStart(5, "0"), clean: false };
  return { value: text, clean: false };
}

function emptyCell(): Cell {
  return { value: null, raw: "", source: null, confidence: 0 };
}

/**
 * Turns one raw file row into a normalized schedule row.
 * `confidence` is the header-mapping confidence discounted when the value
 * itself needed guessing (a two-digit year, a state spelled out, a "1.2M").
 */
export function normalizeRow(
  raw: RawRow,
  mappings: ColumnMapping[],
  rowOrdinal: number,
): LocationRow {
  const byField = mappingByField(mappings);
  const row = { key: "" } as LocationRow;

  for (const field of FIELD_IDS) row[field] = emptyCell();

  for (const field of FIELD_IDS) {
    const mapping = byField[field];
    if (!mapping) continue;

    const rawValue = (raw.cells[mapping.header] ?? "").toString();
    const source = raw.refs[mapping.header] ?? null;
    const kind = FIELD_BY_ID[field].kind;

    let value: Cell["value"] = null;
    let clean = true;

    switch (kind) {
      case "money": {
        const parsed = parseMoney(rawValue);
        value = parsed.value === null ? null : parsed.value * (mapping.scale ?? 1);
        clean = parsed.clean;
        break;
      }
      case "number": {
        const parsed = parseNumber(rawValue);
        value = parsed.value;
        clean = parsed.clean;
        break;
      }
      case "year": {
        const parsed = parseYear(rawValue);
        value = parsed.value;
        clean = parsed.clean;
        break;
      }
      case "bool": {
        const parsed = parseBool(rawValue);
        value = parsed.value;
        clean = parsed.clean;
        break;
      }
      case "enum": {
        const parsed = parseConstruction(rawValue);
        value = parsed.value;
        clean = parsed.clean;
        break;
      }
      default: {
        if (field === "state") {
          const parsed = parseState(rawValue);
          value = parsed.value;
          clean = parsed.clean;
        } else if (field === "zip") {
          const parsed = parseZip(rawValue);
          value = parsed.value;
          clean = parsed.clean;
        } else {
          const text = rawValue.trim();
          value = isEmpty(text) ? null : text.replace(/\s+/g, " ");
          clean = true;
        }
      }
    }

    row[field] = {
      value,
      raw: rawValue,
      source,
      confidence: Number((mapping.confidence * (clean ? 1 : 0.7)).toFixed(2)),
    };
  }

  // Derive TIV when the file gave components instead of a total, but only if
  // the building value is one of them. A contents-only or BI-only sum is not
  // a TIV, and quoting it as one understates the risk by an order of
  // magnitude. Better to leave it empty and let the no_tiv flag say so.
  if (row.tiv.value === null && typeof row.building_value.value === "number") {
    const parts = [row.building_value.value, row.contents_value.value, row.bi_value.value]
      .filter((v): v is number => typeof v === "number");
    row.tiv = {
      value: parts.reduce((a, b) => a + b, 0),
      raw: "(derived)",
      source: null,
      confidence: 0.75,
    };
  }

  if (row.currency.value === null) {
    row.currency = { value: "USD", raw: "(assumed)", source: null, confidence: 0.5 };
  }

  const locId = row.location_id.value ?? rowOrdinal + 1;
  const bldgId = row.building_id.value ?? "1";
  row.key = `${raw.sheet}:${locId}:${bldgId}:${rowOrdinal}`;

  return row;
}
