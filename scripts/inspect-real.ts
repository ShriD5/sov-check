/**
 * Drill-down for one real file: shows the rows behind a given flag code, or
 * a value distribution, so a flag can be judged against the source document.
 *
 *   npx tsx scripts/inspect-real.ts ware-rfq.pdf flag zip_state_mismatch
 *   npx tsx scripts/inspect-real.ts mississippi.pdf flag bad_state 12
 *   npx tsx scripts/inspect-real.ts mississippi.pdf psf
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll } from "../src/lib/engine.js";
import { extractFromPdfDocument, type PdfLikeDocument } from "../src/lib/parse/pdf.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [name, mode = "flag", arg = "", limitArg = "15"] = process.argv.slice(2);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = join(here, "..", "fixtures", "real", name);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const parsed = await extractFromPdfDocument(doc as unknown as PdfLikeDocument, name);
  const { rows, flags } = extractAll({ headers: parsed.headers, rows: parsed.rows });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  if (mode === "flag") {
    const hits = flags.filter((f) => f.code === arg);
    console.log(`${hits.length} ${arg} flags\n`);
    for (const flag of hits.slice(0, Number(limitArg))) {
      const r = byKey.get(flag.rowKey)!;
      const src = r.address.source;
      const where = src?.kind === "pdf" ? `p${src.page} l${src.line}` : "";
      console.log(
        `${where.padEnd(9)} ${String(r.description.value ?? "").slice(0, 26).padEnd(26)} ${String(r.address.value ?? "").slice(0, 30).padEnd(30)} ` +
          `${String(r.city.value ?? "").slice(0, 14).padEnd(14)} st=${String(r.state.value ?? "").padEnd(6)} zip=${String(r.zip.value ?? "").padEnd(6)} ` +
          `sqft=${String(r.sq_ft.value ?? "").padEnd(6)} bldg=${String(r.building_value.value ?? "").padEnd(9)} | ${flag.message}`,
      );
    }
  }

  if (mode === "psf") {
    const psf = rows
      .map((r) => ({ r, sq: r.sq_ft.value, v: r.building_value.value }))
      .filter((x): x is { r: (typeof rows)[number]; sq: number; v: number } => typeof x.sq === "number" && x.sq > 0 && typeof x.v === "number" && x.v > 0)
      .map((x) => ({ ...x, psf: x.v / x.sq }))
      .sort((a, b) => b.psf - a.psf);
    const pct = (p: number) => psf[Math.floor((psf.length - 1) * p)]?.psf.toFixed(0);
    console.log(`${psf.length} rows with both sq ft and building value`);
    console.log(`$/sqft  p50=${pct(0.5)}  p90=${pct(0.1)}  p99=${pct(0.01)}  max=${psf[0]?.psf.toFixed(0)}`);
    console.log(`sq ft < 400: ${rows.filter((r) => typeof r.sq_ft.value === "number" && r.sq_ft.value < 400).length}`);
    console.log("\nhighest $/sqft:");
    for (const x of psf.slice(0, Number(limitArg))) {
      console.log(`  $${x.psf.toFixed(0).padStart(6)}/sqft  ${String(x.r.description.value ?? "").slice(0, 34).padEnd(34)} sqft=${x.sq}  bldg=${x.v}`);
    }
  }
}

void main();
