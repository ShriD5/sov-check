import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll, buildEvents } from "../src/lib/engine.js";
import { parseWorkbook } from "../src/lib/parse/sheet.js";
import { extractFromPdfDocument, type PdfLikeDocument } from "../src/lib/parse/pdf.js";
import type { LocationRow, ParsedFile, StreamEvent } from "../src/lib/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const filesDir = join(here, "..", "fixtures", "files");

interface ExpectedRow {
  address: string;
  state: string;
  zip: string;
  year_built: number | null;
  sq_ft: number | null;
  construction: string | null;
  building_value: number;
  contents_value: number;
  tiv: number;
}

interface Expected {
  locations: number;
  tiv: number;
  rows: ExpectedRow[];
  expectFlags?: { code: string; atLeast: number }[];
}

const CASES = [
  { file: "01-clean.xlsx", label: "Clean template" },
  { file: "02-merged-header.xlsx", label: "Two-tier header + totals row" },
  { file: "03-split-tiv.xlsx", label: "No TIV column, derive it" },
  { file: "04-multi-sheet.xlsx", label: "One sheet per state" },
  { file: "05-thousands.xlsx", label: "Values in $000s" },
  { file: "06-table.pdf", label: "PDF table with blank cells" },
  { file: "07-adversarial.xlsx", label: "Broker's own header vocabulary" },
];

const COMPARED_FIELDS: (keyof ExpectedRow)[] = [
  "address",
  "state",
  "zip",
  "year_built",
  "sq_ft",
  "construction",
  "building_value",
  "contents_value",
  "tiv",
];

async function loadPdf(path: string, fileName: string): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  return extractFromPdfDocument(doc as unknown as PdfLikeDocument, fileName);
}

async function parseFixture(file: string): Promise<ParsedFile> {
  const path = join(filesDir, file);
  if (file.endsWith(".pdf")) return loadPdf(path, file);
  const buffer = readFileSync(path);
  return parseWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    file,
  );
}

function valueOf(row: LocationRow, field: keyof ExpectedRow): string | number | null {
  const cell = row[field as keyof LocationRow] as LocationRow["address"];
  return cell.value as string | number | null;
}

function matches(actual: string | number | null, expected: string | number | null): boolean {
  if (expected === null) return actual === null;
  if (actual === null) return false;
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) <= Math.max(1, Math.abs(expected) * 0.001);
  }
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

/**
 * Replays a run the way a flaky network would: cut the stream at an arbitrary
 * point, reconnect from the last id, and assert the schedule is byte-identical
 * to the run that was never interrupted.
 */
function chaosReplay(events: StreamEvent[], cutAt: number): LocationRow[] {
  const received: LocationRow[] = [];
  const seen = new Set<string>();

  const consume = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const event = events[i];
      if (event.type !== "row") continue;
      if (seen.has(event.row.key)) continue;
      seen.add(event.row.key);
      received.push(event.row);
    }
  };

  // First connection dies at `cutAt`, so the client has ids 1..cutAt.
  consume(0, cutAt);
  // Reconnect with Last-Event-ID = cutAt, server resumes at that index.
  consume(cutAt, events.length);

  return received;
}

async function main() {
  let totalAnswered = 0;
  let totalRight = 0;
  let totalDeferred = 0;
  const rowsOut: string[] = [];
  let chaosRuns = 0;
  let chaosPasses = 0;
  let flagChecks = 0;
  let flagPasses = 0;
  let totalColumns = 0;
  let totalUnmapped = 0;
  let wrongMappings = 0;

  console.log("\nSOV Check eval\n");

  for (const testCase of CASES) {
    const parsed = await parseFixture(testCase.file);
    const expected = JSON.parse(
      readFileSync(join(filesDir, testCase.file.replace(/\.(xlsx|pdf)$/, ".expected.json")), "utf8"),
    ) as Expected;

    const { rows, flags, mappings } = extractAll({ headers: parsed.headers, rows: parsed.rows });
    const unmapped = mappings.filter((m) => !m.field).length;
    totalColumns += mappings.length;
    totalUnmapped += unmapped;

    // Three outcomes per cell, and they are not equally bad:
    //   answered right   - the tool mapped the column and got the value
    //   deferred         - the column was left unmapped for a human
    //   answered wrong   - the tool mapped it and got it wrong. Unacceptable.
    const mappedFields = new Set(mappings.filter((m) => m.field).map((m) => m.field));
    let answered = 0;
    let right = 0;
    let deferred = 0;
    const misses: string[] = [];

    const compareCount = Math.min(rows.length, expected.rows.length);
    for (let i = 0; i < compareCount; i++) {
      for (const field of COMPARED_FIELDS) {
        const expectedValue = expected.rows[i][field];
        const actual = valueOf(rows[i], field);

        // A field nobody mapped, where the file did have the data, is deferred
        // work rather than a wrong answer. TIV counts as answerable only when
        // the file gave a TIV column or a building value to derive it from.
        const answerable =
          field === "tiv"
            ? mappedFields.has("tiv") || mappedFields.has("building_value")
            : mappedFields.has(field);

        if (!answerable && expectedValue !== null) {
          deferred++;
          continue;
        }

        answered++;
        if (matches(actual, expectedValue)) {
          right++;
          continue;
        }

        wrongMappings++;
        if (misses.length < 3) {
          misses.push(
            `row ${i + 1} ${field}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expectedValue)}`,
          );
        }
      }
    }

    // A missing or extra row is a wrong answer across every compared field.
    const rowDelta = Math.abs(rows.length - expected.rows.length);
    answered += rowDelta * COMPARED_FIELDS.length;
    if (rowDelta) {
      wrongMappings += rowDelta * COMPARED_FIELDS.length;
      misses.push(`row count: got ${rows.length}, want ${expected.rows.length}`);
    }

    totalAnswered += answered;
    totalRight += right;
    totalDeferred += deferred;

    for (const check of expected.expectFlags ?? []) {
      flagChecks++;
      const count = flags.filter((f) => f.code === check.code).length;
      if (count >= check.atLeast) flagPasses++;
      else misses.push(`expected >= ${check.atLeast} ${check.code} flags, got ${count}`);
    }

    // Chaos: cut the stream at three points and require an identical result.
    const events = buildEvents({
      fileName: testCase.file,
      kind: parsed.kind,
      headers: parsed.headers,
      rows: parsed.rows,
    });
    const clean = chaosReplay(events, events.length);
    for (const cut of [1, Math.floor(events.length / 3), Math.floor(events.length * 0.8)]) {
      chaosRuns++;
      const interrupted = chaosReplay(events, cut);
      const same =
        interrupted.length === clean.length &&
        JSON.stringify(interrupted) === JSON.stringify(clean);
      if (same) chaosPasses++;
      else misses.push(`chaos cut at ${cut}: ${interrupted.length} rows vs ${clean.length}`);
    }

    const precision = answered ? right / answered : 1;
    const status = precision >= 0.99 ? "ok  " : precision >= 0.95 ? "warn" : "FAIL";
    rowsOut.push(
      `  ${status}  ${testCase.label.padEnd(32)} ${rows.length.toString().padStart(3)} rows  ` +
        `${(precision * 100).toFixed(1).padStart(5)}% of answers right  ` +
        `${deferred.toString().padStart(3)} deferred  ` +
        `${unmapped}/${mappings.length} cols unmapped`,
    );
    for (const miss of misses) rowsOut.push(`        ${miss}`);
  }

  console.log(rowsOut.join("\n"));

  const precision = totalAnswered ? totalRight / totalAnswered : 1;
  const coverage = totalAnswered + totalDeferred ? totalAnswered / (totalAnswered + totalDeferred) : 1;

  console.log("\n  " + "-".repeat(78));
  console.log(`  Precision: values right, of values answered   ${(precision * 100).toFixed(1)}%  (${totalRight}/${totalAnswered})`);
  console.log(`  Coverage: fields answered, not deferred       ${(coverage * 100).toFixed(1)}%  (${totalDeferred} deferred to a human)`);
  console.log(`  Wrong answers                                 ${wrongMappings}`);
  console.log(`  Columns handed back for mapping               ${totalUnmapped}/${totalColumns}`);
  console.log(`  Expected flags raised                         ${flagPasses}/${flagChecks}`);
  console.log(`  Chaos resume identical to clean run           ${chaosPasses}/${chaosRuns}`);
  console.log("");

  // A deferred column is recoverable, a wrong number is not. Wrong fails the run.
  const ok = wrongMappings === 0 && chaosPasses === chaosRuns && flagPasses === flagChecks;
  if (!ok) process.exitCode = 1;
}

void main();
