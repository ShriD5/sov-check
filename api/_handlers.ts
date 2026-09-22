import { createRun, getRun } from "./_runs";
import type { ExtractRequest } from "../src/lib/types";

export interface MiniRes {
  status(code: number): void;
  header(name: string, value: string): void;
  write(chunk: string): void;
  end(body?: string): void;
  onClose(cb: () => void): void;
}

const MAX_ROWS = 5000;

export function handleExtract(body: unknown, res: MiniRes): void {
  const req = body as ExtractRequest | undefined;

  if (!req || !Array.isArray(req.rows) || !Array.isArray(req.headers)) {
    res.status(400);
    res.header("content-type", "application/json");
    res.end(JSON.stringify({ error: "Expected { headers: string[], rows: RawRow[] }" }));
    return;
  }

  if (req.rows.length > MAX_ROWS) {
    res.status(413);
    res.header("content-type", "application/json");
    res.end(JSON.stringify({ error: `That schedule has ${req.rows.length} rows; the demo caps at ${MAX_ROWS}.` }));
    return;
  }

  try {
    const run = createRun(req);
    res.status(200);
    res.header("content-type", "application/json");
    res.end(JSON.stringify({ runId: run.id, events: run.events.length }));
  } catch (error) {
    res.status(500);
    res.header("content-type", "application/json");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }));
  }
}

/** Per-row delay so the stream is observable, and so resume has something to resume. */
const ROW_DELAY_MS = Number(process.env.SOV_ROW_DELAY_MS ?? 45);

export function handleStream(
  params: { runId: string | null; lastEventId: number },
  res: MiniRes,
): void {
  const run = params.runId ? getRun(params.runId) : undefined;

  if (!run) {
    res.status(404);
    res.header("content-type", "application/json");
    res.end(JSON.stringify({ error: "Unknown or expired run. Re-upload the file." }));
    return;
  }

  res.status(200);
  res.header("content-type", "text/event-stream; charset=utf-8");
  res.header("cache-control", "no-cache, no-transform");
  res.header("connection", "keep-alive");
  res.header("x-accel-buffering", "no");

  let closed = false;
  res.onClose(() => {
    closed = true;
  });

  const send = (id: number, data: unknown) => {
    res.write(`id: ${id}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Event ids are 1-based and index directly into run.events, so a resume is
  // an array slice rather than a replay of work already done.
  let cursor = Math.max(0, params.lastEventId);
  let emittedThisConnection = 0;

  const pump = () => {
    if (closed) return;

    if (cursor >= run.events.length) {
      res.end();
      return;
    }

    const isResume = params.lastEventId > 0;
    const budgetSpent = run.chaosSpent;

    // Simulated network drop: the connection dies mid-stream with no "done".
    if (!isResume && !budgetSpent && run.chaosDropAfter && emittedThisConnection >= run.chaosDropAfter) {
      run.chaosSpent = true;
      closed = true;
      res.end();
      return;
    }

    // Simulated model truncation: a retryable error, then silence. The client
    // reconnects from its last id and the remaining rows arrive.
    if (!isResume && !budgetSpent && run.chaosTruncateAfter && emittedThisConnection >= run.chaosTruncateAfter) {
      run.chaosSpent = true;
      send(cursor, {
        type: "error",
        message: "Model output hit the token limit mid-schedule",
        retryable: true,
      });
      closed = true;
      res.end();
      return;
    }

    const event = run.events[cursor];
    cursor += 1;
    emittedThisConnection += 1;
    send(cursor, event);

    if (event.type === "row") setTimeout(pump, ROW_DELAY_MS);
    else setTimeout(pump, 0);
  };

  pump();
}
