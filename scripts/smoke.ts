/**
 * End-to-end check against a running server. Exercises the real wire
 * protocol: gzipped POST, SSE, the server dropping the connection
 * mid-stream, a reconnect with Last-Event-ID, and a schedule that must match
 * the run that was never interrupted.
 *
 *   npm run dev          # in one terminal
 *   npx tsx scripts/smoke.ts
 *   SOV_BASE=https://sov-check.vercel.app npx tsx scripts/smoke.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parseWorkbook } from "../src/lib/parse/sheet.js";
import { extractFromPdfDocument, type PdfLikeDocument } from "../src/lib/parse/pdf.js";
import { hydrateRow, type WireRow } from "../src/lib/wire.js";
import type { ExtractRequest, LocationRow, ParsedFile, Reconciliation, StreamEvent } from "../src/lib/types.js";

const BASE = process.env.SOV_BASE ?? "http://127.0.0.1:5173";
const here = dirname(fileURLToPath(import.meta.url));

function loadSheet(file: string): ParsedFile {
  const buffer = readFileSync(join(here, "..", "fixtures", "files", file));
  return parseWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    file,
  );
}

async function loadPdf(path: string, name: string): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  return extractFromPdfDocument(doc as unknown as PdfLikeDocument, name);
}

function payloadOf(parsed: ParsedFile, extra: Partial<ExtractRequest> = {}): ExtractRequest {
  return {
    fileName: parsed.fileName,
    kind: parsed.kind,
    headers: parsed.headers,
    rows: parsed.rows,
    subtotals: parsed.subtotals,
    ...extra,
  };
}

/** Reads one SSE connection to completion or death. */
async function readStream(payload: ExtractRequest, lastEventId: number, gzip: boolean) {
  const json = JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(gzip ? { "x-body-encoding": "gzip" } : {}),
      ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}),
    },
    body: gzip ? gzipSync(json) : json,
  });
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status} ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastId = lastEventId;
  let sawDone = false;
  const rows: LocationRow[] = [];
  let reconciliation: Reconciliation[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let id = lastId;
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("id:")) id = Number(line.slice(3).trim());
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const event = JSON.parse(data) as StreamEvent;
      lastId = id;
      if (event.type === "row") rows.push(hydrateRow(event.row as WireRow));
      if (event.type === "reconciliation") reconciliation = event.results;
      if (event.type === "done") sawDone = true;
    }
  }

  return { rows, lastId, sawDone, reconciliation, wireBytes: gzip ? gzipSync(json).length : json.length };
}

type Check = [string, boolean, string];

async function scenario(name: string, parsed: ParsedFile, dropAfter: number, gzip: boolean): Promise<Check[]> {
  const checks: Check[] = [];
  const started = performance.now();

  const clean = await readStream(payloadOf(parsed), 0, gzip);
  const cleanMs = Math.round(performance.now() - started);
  checks.push([`${name}: clean run reaches done`, clean.sawDone, `${clean.rows.length} rows in ${cleanMs}ms, body ${(clean.wireBytes / 1e6).toFixed(2)}MB`]);

  const first = await readStream(payloadOf(parsed, { chaosDropAfter: dropAfter }), 0, gzip);
  checks.push([`${name}: first leg dies without done`, !first.sawDone && first.rows.length > 0, `${first.rows.length} rows banked`]);

  // The resume may land on a different serverless instance. It has to work anyway.
  const second = await readStream(payloadOf(parsed), first.lastId, gzip);
  checks.push([`${name}: resumed leg reaches done`, second.sawDone, `resumed at event ${first.lastId}`]);

  const stitched = [...first.rows, ...second.rows];
  const unique = new Set(stitched.map((r) => r.key)).size;
  checks.push([`${name}: no row delivered twice`, unique === stitched.length, `${stitched.length} rows, ${unique} unique`]);
  checks.push([
    `${name}: resumed schedule identical to clean`,
    JSON.stringify(stitched) === JSON.stringify(clean.rows),
    `${stitched.length} vs ${clean.rows.length}`,
  ]);

  if (clean.reconciliation.length) {
    const tied = clean.reconciliation.filter((r) => r.matched).length;
    checks.push([
      `${name}: ties out to the source's own totals`,
      tied === clean.reconciliation.length,
      `${tied}/${clean.reconciliation.length}`,
    ]);
  }

  return checks;
}

async function main() {
  const checks: Check[] = [];

  checks.push(...(await scenario("synthetic $000s", loadSheet("05-thousands.xlsx"), 8, false)));

  const ms = join(here, "..", "fixtures", "real", "mississippi.pdf");
  if (existsSync(ms)) {
    checks.push(...(await scenario("State of Mississippi", await loadPdf(ms, "mississippi.pdf"), 1200, true)));
  } else {
    console.log("  (skipping Mississippi: run scripts/fetch-real.sh first)");
  }

  const bad = await fetch(`${BASE}/api/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonsense: true }),
  });
  checks.push(["malformed body returns 400", bad.status === 400, `status ${bad.status}`]);

  console.log(`\nSOV Check smoke test against ${BASE}\n`);
  let failed = 0;
  for (const [label, pass, detail] of checks) {
    if (!pass) failed++;
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${label.padEnd(54)} ${detail}`);
  }
  console.log(`\n  ${checks.length - failed}/${checks.length} passed\n`);
  if (failed) process.exitCode = 1;
}

void main();
