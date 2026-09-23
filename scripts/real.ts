/**
 * Runs public, real-world Statements of Values through the same pipeline the
 * app uses and prints what it made of them. Unlike the synthetic eval there is
 * no answer key, so the output is for a human to read: mapping decisions, a
 * sample of rows, totals, and what got flagged.
 *
 *   npx tsx scripts/real.ts [file ...]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll } from "../src/lib/engine.js";
import { parseWorkbook } from "../src/lib/parse/sheet.js";
import { extractFromPdfDocument, type PdfLikeDocument } from "../src/lib/parse/pdf.js";
import { summarize } from "../src/lib/flags.js";
import type { ParsedFile } from "../src/lib/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const realDir = join(here, "..", "fixtures", "real");

async function parse(path: string, name: string): Promise<ParsedFile> {
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
    return extractFromPdfDocument(doc as unknown as PdfLikeDocument, name);
  }
  const buffer = readFileSync(path);
  return parseWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    name,
  );
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : readdirSync(realDir).filter((f) => /\.(pdf|xlsx|xls|csv)$/i.test(f));

  for (const name of files) {
    const path = join(realDir, name);
    const started = performance.now();
    const parsed = await parse(path, name);
    const { mappings, rows, flags, reconciliation } = extractAll({
      headers: parsed.headers,
      rows: parsed.rows,
      subtotals: parsed.subtotals,
    });
    const ms = Math.round(performance.now() - started);
    const s = summarize(rows, flags);

    console.log(`\n${"=".repeat(90)}\n${name}   ${parsed.rows.length} raw rows   ${ms}ms`);
    for (const note of parsed.notes) console.log(`  note: ${note}`);

    console.log("\n  mapping");
    for (const m of mappings) {
      console.log(
        `    ${m.header.slice(0, 34).padEnd(34)} -> ${String(m.field ?? "-").padEnd(16)} ${m.via} ${m.field ? Math.round(m.confidence * 100) + "%" : ""}${m.scale ? ` x${m.scale}` : ""}`,
      );
    }

    console.log("\n  first rows");
    for (const r of rows.slice(0, 6)) {
      console.log(
        `    ${String(r.location_id.value ?? "").padEnd(4)} ${String(r.building_id.value ?? "").padEnd(3)} ` +
          `${String(r.description.value ?? "").slice(0, 20).padEnd(20)} ${String(r.address.value ?? "").slice(0, 26).padEnd(26)} ` +
          `${String(r.city.value ?? "").slice(0, 12).padEnd(12)} ${String(r.state.value ?? "").padEnd(3)} ` +
          `${String(r.zip.value ?? "").padEnd(6)} yr=${String(r.year_built.value ?? "").padEnd(5)} sqft=${String(r.sq_ft.value ?? "").padEnd(6)} ` +
          `${String(r.construction.value ?? "").slice(0, 16).padEnd(16)} bldg=${String(r.building_value.value ?? "").padEnd(9)} tiv=${r.tiv.value ?? ""}`,
      );
    }

    const byCode = flags.reduce<Record<string, number>>((acc, f) => {
      acc[f.code] = (acc[f.code] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `\n  locations=${s.locations}  tiv=${money(s.tiv)}  cope=${Math.round(s.copeCompleteness * 100)}%  errors=${s.errors}  warnings=${s.warnings}`,
    );
    console.log(`  flags: ${Object.entries(byCode).map(([k, v]) => `${k}=${v}`).join("  ")}`);

    if (reconciliation.length) {
      const tied = reconciliation.filter((r) => r.matched);
      const byField = tied.reduce<Record<string, number>>((acc, r) => {
        acc[r.matched!] = (acc[r.matched!] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        `  tie-out: ${tied.length}/${reconciliation.length} source totals reproduced to the dollar  ` +
          Object.entries(byField).map(([k, v]) => `${k}=${v}`).join(" "),
      );
      for (const r of reconciliation.filter((x) => !x.matched).slice(0, 8)) {
        console.log(
          `    MISS  ${r.label.slice(0, 44).padEnd(44)} ${r.where.padEnd(18)} source=${money(r.sourceAmount)} schedule=${money(r.scheduleAmount)} diff=${money(r.diff)} (${r.rows} rows)`,
        );
      }
    }
  }
}

void main();
