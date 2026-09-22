/**
 * End-to-end check against a running dev server. Exercises the real wire
 * protocol: POST /api/extract, consume SSE, have the server drop the
 * connection mid-stream, reconnect with Last-Event-ID, and assert the
 * schedule matches the run that was never interrupted.
 *
 *   npm run dev          # in one terminal
 *   npx tsx scripts/smoke.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkbook } from "../src/lib/parse/sheet.js";
import type { LocationRow, StreamEvent } from "../src/lib/types.js";

const BASE = process.env.SOV_BASE ?? "http://127.0.0.1:5173";
const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "fixtures", "files", "05-thousands.xlsx");

function load() {
  const buffer = readFileSync(fixture);
  return parseWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    "05-thousands.xlsx",
  );
}

async function startRun(chaos: { drop?: number } = {}) {
  const parsed = load();
  const res = await fetch(`${BASE}/api/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: parsed.fileName,
      kind: parsed.kind,
      headers: parsed.headers,
      rows: parsed.rows,
      chaosDropAfter: chaos.drop,
    }),
  });
  if (!res.ok) throw new Error(`extract failed: ${res.status} ${await res.text()}`);
  const { runId } = (await res.json()) as { runId: string };
  return runId;
}

/** Reads one SSE connection to completion or death. Returns what it got. */
async function readStream(runId: string, lastEventId: number) {
  const res = await fetch(`${BASE}/api/stream?runId=${runId}&lastEventId=${lastEventId}`, {
    headers: lastEventId ? { "Last-Event-ID": String(lastEventId) } : {},
  });
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastId = lastEventId;
  let sawDone = false;
  const rows: LocationRow[] = [];

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
      if (event.type === "row") rows.push(event.row);
      if (event.type === "done") sawDone = true;
    }
  }

  return { rows, lastId, sawDone };
}

async function main() {
  const checks: [string, boolean, string][] = [];

  // Clean run.
  const cleanId = await startRun();
  const clean = await readStream(cleanId, 0);
  checks.push(["clean run reaches done", clean.sawDone, `sawDone=${clean.sawDone}`]);
  checks.push(["clean run returns 21 rows", clean.rows.length === 21, `${clean.rows.length} rows`]);

  // Interrupted run: server kills the connection after 8 events.
  const chaosId = await startRun({ drop: 8 });
  const firstLeg = await readStream(chaosId, 0);
  checks.push([
    "first leg dies without done",
    !firstLeg.sawDone && firstLeg.rows.length > 0,
    `${firstLeg.rows.length} rows, sawDone=${firstLeg.sawDone}`,
  ]);

  const secondLeg = await readStream(chaosId, firstLeg.lastId);
  checks.push(["resumed leg reaches done", secondLeg.sawDone, `sawDone=${secondLeg.sawDone}`]);

  const stitched = [...firstLeg.rows, ...secondLeg.rows];
  checks.push([
    "no row delivered twice across the resume",
    new Set(stitched.map((r) => r.key)).size === stitched.length,
    `${stitched.length} rows, ${new Set(stitched.map((r) => r.key)).size} unique`,
  ]);
  checks.push([
    "resumed schedule is identical to the clean one",
    JSON.stringify(stitched) === JSON.stringify(clean.rows),
    `${stitched.length} vs ${clean.rows.length} rows`,
  ]);

  // Expired or unknown run is a clean 404, not a hang.
  const missing = await fetch(`${BASE}/api/stream?runId=run_nope`);
  checks.push(["unknown run returns 404", missing.status === 404, `status ${missing.status}`]);

  console.log("\nSOV Check smoke test against " + BASE + "\n");
  let failed = 0;
  for (const [name, pass, detail] of checks) {
    if (!pass) failed++;
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name.padEnd(46)} ${detail}`);
  }
  console.log(`\n  ${checks.length - failed}/${checks.length} passed\n`);
  if (failed) process.exitCode = 1;
}

void main();
