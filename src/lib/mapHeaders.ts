import { FIELD_BY_ID, FIELD_IDS } from "./schema.js";
import { IGNORE_HEADERS, SCALE_HINTS, SYNONYMS } from "./synonyms.js";
import type { ColumnMapping, FieldId, RawRow } from "./types.js";

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein, capped for short header strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  return 1 - editDistance(a, b) / longest;
}

/** Detects "$000s", "in thousands", "MM" and friends in a header. */
export function detectScale(header: string): { scale: number; label: string } | null {
  for (const hint of SCALE_HINTS) {
    if (hint.pattern.test(header)) return { scale: hint.scale, label: hint.label };
  }
  return null;
}

interface Candidate {
  field: FieldId;
  score: number;
  via: ColumnMapping["via"];
}

/**
 * Whole-word containment. Raw substring matching is how "Reinstatement Value"
 * ends up mapped to State: it literally contains "state". Headers are already
 * space-normalized, so compare word sequences instead of characters.
 */
function containsWords(haystack: string, needle: string): boolean {
  const words = haystack.split(" ");
  const target = needle.split(" ");
  if (target.length > words.length) return false;

  for (let i = 0; i + target.length <= words.length; i++) {
    let hit = true;
    for (let j = 0; j < target.length; j++) {
      if (words[i + j] !== target[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

function scoreHeader(normalized: string): Candidate[] {
  const best = new Map<FieldId, Candidate>();

  for (const field of FIELD_IDS) {
    for (const syn of SYNONYMS[field]) {
      const target = normalizeHeader(syn);
      let score = 0;
      let via: ColumnMapping["via"] = "fuzzy";

      if (normalized === target) {
        score = 1;
        via = "exact";
      } else if (containsWords(normalized, target)) {
        // Score by how much of the header the synonym accounts for, so the
        // more specific match wins. In "Building Value ($000s)" both
        // "building" (Bldg #) and "building value" appear; without weighting
        // by coverage the shorter one can win and send money into an id column.
        const coverage = target.split(" ").length / normalized.split(" ").length;
        score = 0.6 + 0.32 * Math.min(1, coverage);
        via = "synonym";
      } else {
        const sim = similarity(normalized, target);
        if (sim >= 0.82) {
          score = sim * 0.85;
          via = "fuzzy";
        }
      }

      if (score <= 0) continue;
      const held = best.get(field);
      if (!held || score > held.score) best.set(field, { field, score, via });
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** What the values in a column actually look like, used to break header ties. */
type ColumnShape = "money" | "smallNumber" | "text" | "empty";

function shapeOf(samples: string[]): ColumnShape {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (!values.length) return "empty";

  let numeric = 0;
  let large = 0;

  for (const value of values) {
    const cleaned = value.replace(/[$£€₹,\s()]/g, "");
    const num = Number(cleaned);
    if (!Number.isFinite(num) || cleaned === "") continue;
    numeric++;
    if (Math.abs(num) >= 1000) large++;
  }

  if (numeric / values.length < 0.7) return "text";
  return large / Math.max(1, numeric) > 0.6 ? "money" : "smallNumber";
}

function shapeFits(kind: string, shape: ColumnShape): boolean {
  if (shape === "empty") return true;
  if (kind === "money") return shape === "money";
  if (kind === "number" || kind === "year") return shape !== "text";
  // Identity and text columns should not be full of large numbers.
  return shape !== "money";
}

/**
 * Maps raw headers onto the schedule fields.
 *
 * Deterministic first: exact, then synonym containment, then bounded fuzzy.
 * Anything under `llmThreshold` is returned unmapped with its best guess score
 * so the UI can ask the user (or an LLM, when a key is configured) to decide.
 */
export function mapHeaders(
  headers: string[],
  rows?: RawRow[],
  llmThreshold = 0.6,
): ColumnMapping[] {
  const taken = new Map<FieldId, { header: string; score: number }>();
  const draft: ColumnMapping[] = [];
  const sampleRows = rows?.slice(0, 25) ?? [];

  for (const header of headers) {
    const normalized = normalizeHeader(header);

    if (!normalized) {
      draft.push({ header, field: null, confidence: 0, via: "unmapped" });
      continue;
    }

    if (IGNORE_HEADERS.some((ignore) => normalized === normalizeHeader(ignore))) {
      draft.push({ header, field: null, confidence: 1, via: "unmapped" });
      continue;
    }

    const candidates = scoreHeader(normalized);
    let best = candidates[0] ?? null;

    // When two fields are near-tied on the header text alone, let the column's
    // own values decide. "Building" is both an id label and a money label;
    // a column of seven-figure numbers is not a building number.
    if (best && sampleRows.length) {
      const shape = shapeOf(sampleRows.map((row) => row.cells[header] ?? ""));
      if (!shapeFits(FIELD_BY_ID[best.field].kind, shape)) {
        const better = candidates.find(
          (c) => c.score >= best!.score - 0.2 && shapeFits(FIELD_BY_ID[c.field].kind, shape),
        );
        if (better) best = better;
      }
    }

    const scaleHint = detectScale(header);

    if (!best || best.score < llmThreshold) {
      draft.push({
        header,
        field: null,
        confidence: best?.score ?? 0,
        via: "unmapped",
        ...(scaleHint ? { scale: scaleHint.scale } : {}),
      });
      continue;
    }

    draft.push({
      header,
      field: best.field,
      confidence: Number(best.score.toFixed(2)),
      via: best.via,
      ...(scaleHint ? { scale: scaleHint.scale } : {}),
    });
  }

  // One field per column: if two headers claim the same field, the stronger
  // one keeps it and the weaker is demoted to unmapped for human review.
  for (const mapping of draft) {
    if (!mapping.field) continue;
    const held = taken.get(mapping.field);
    if (!held) {
      taken.set(mapping.field, { header: mapping.header, score: mapping.confidence });
      continue;
    }
    if (mapping.confidence > held.score) {
      const loser = draft.find((m) => m.header === held.header);
      if (loser) {
        loser.field = null;
        loser.via = "unmapped";
      }
      taken.set(mapping.field, { header: mapping.header, score: mapping.confidence });
    } else {
      mapping.field = null;
      mapping.via = "unmapped";
    }
  }

  return draft;
}

export function mappingByField(mappings: ColumnMapping[]): Partial<Record<FieldId, ColumnMapping>> {
  const out: Partial<Record<FieldId, ColumnMapping>> = {};
  for (const m of mappings) if (m.field) out[m.field] = m;
  return out;
}
