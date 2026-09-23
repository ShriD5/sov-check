import { buildEvents } from "../src/lib/engine.js";
import { compactRow } from "../src/lib/wire.js";
import type { ExtractRequest } from "../src/lib/types.js";

export interface MiniRes {
  status(code: number): void;
  header(name: string, value: string): void;
  write(chunk: string): void;
  end(body?: string): void;
  onClose(cb: () => void): void;
}

const MAX_ROWS = 5000;

/**
 * Per-row pacing so the stream is observable and a resume has something to
 * resume, scaled so the whole schedule takes a few seconds whatever its size.
 * A flat 45ms per row is pleasant for 21 rows and three minutes for 3,861.
 */
const MAX_ROW_DELAY_MS = Number(process.env.SOV_ROW_DELAY_MS ?? 45);
const TARGET_STREAM_MS = 6000;

function rowDelay(rows: number): number {
  return Math.min(MAX_ROW_DELAY_MS, Math.floor(TARGET_STREAM_MS / Math.max(1, rows)));
}

function fail(res: MiniRes, code: number, message: string) {
  res.status(code);
  res.header("content-type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

/**
 * Streams a normalized schedule as SSE.
 *
 * Deliberately stateless. Extraction is deterministic, so the same input
 * always produces the same ordered event list, and a resume is just a slice
 * of it. Holding runs in server memory would be cheaper per reconnect but
 * would break the moment a retry lands on a different instance or after a
 * cold start, which on serverless is most of the time. Trading a re-POST of
 * the rows for a resume that always works is the right way round.
 */
export function handleStream(body: unknown, res: MiniRes, headerLastEventId = 0): void {
  const req = body as (ExtractRequest & { lastEventId?: number }) | undefined;

  if (!req || !Array.isArray(req.rows) || !Array.isArray(req.headers)) {
    fail(res, 400, "Expected { headers: string[], rows: RawRow[] }");
    return;
  }
  if (req.rows.length > MAX_ROWS) {
    fail(res, 413, `That schedule has ${req.rows.length} rows; this demo caps at ${MAX_ROWS}.`);
    return;
  }

  let events;
  try {
    events = buildEvents(req);
  } catch (error) {
    fail(res, 500, error instanceof Error ? error.message : "Extraction failed");
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
    res.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Event ids are 1-based and index directly into the event list, so picking
  // up from `lastEventId` sends exactly what the client missed, no more.
  // The header wins: the client compresses the body once and reuses it on
  // every retry, so the resume position cannot live inside it.
  const lastEventId = Math.max(0, headerLastEventId || Number(req.lastEventId ?? 0) || 0);
  const delay = rowDelay(req.rows.length);
  let cursor = Math.min(lastEventId, events.length);
  let emittedThisConnection = 0;
  const isResume = lastEventId > 0;

  const pump = () => {
    if (closed) return;

    if (cursor >= events.length) {
      res.end();
      return;
    }

    // Simulated network drop: the connection dies with no terminal event.
    if (!isResume && req.chaosDropAfter && emittedThisConnection >= req.chaosDropAfter) {
      closed = true;
      res.end();
      return;
    }

    // Simulated model truncation: a retryable error, then silence. The client
    // reconnects from its last id and the remaining rows arrive.
    if (!isResume && req.chaosTruncateAfter && emittedThisConnection >= req.chaosTruncateAfter) {
      send(cursor, {
        type: "error",
        message: "Model output hit the token limit mid-schedule",
        retryable: true,
      });
      closed = true;
      res.end();
      return;
    }

    const event = events[cursor];
    cursor += 1;
    emittedThisConnection += 1;
    send(cursor, event.type === "row" ? { ...event, row: compactRow(event.row) } : event);

    if (event.type === "row" && delay > 0) setTimeout(pump, delay);
    else setImmediate(pump);
  };

  pump();
}
