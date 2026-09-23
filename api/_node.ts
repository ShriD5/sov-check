import { gunzipSync } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MiniRes } from "./_handlers.js";

/** Adapts a Node response to the tiny surface the handlers need. */
export function nodeRes(res: ServerResponse): MiniRes {
  return {
    status: (code) => {
      res.statusCode = code;
    },
    header: (name, value) => res.setHeader(name, value),
    write: (chunk) => {
      res.write(chunk);
      // SSE only works if each event leaves the process immediately.
      (res as ServerResponse & { flush?: () => void }).flush?.();
    },
    end: (body) => res.end(body),
    onClose: (cb) => {
      res.on("close", cb);
    },
  };
}

/** Compressed wire size cap. Vercel rejects request bodies over 4.5MB. */
const MAX_WIRE_BYTES = 4 * 1024 * 1024;
/** Decompressed cap, so a small gzip bomb cannot eat the function's memory. */
const MAX_JSON_BYTES = 60 * 1024 * 1024;

/**
 * Reads a JSON body, gunzipping it when the client says it compressed it.
 *
 * The State of Mississippi's SOV is 4.0MB of JSON uncompressed, a hair under
 * Vercel's 4.5MB request limit, and every resume re-sends it. Gzipped it is
 * 0.31MB. The client compresses once and reuses the same bytes on every
 * retry, so a reconnect is cheap and a larger schedule still fits.
 */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_WIRE_BYTES) throw new Error("Body too large");
    chunks.push(buf);
  }

  if (!chunks.length) return undefined;

  let raw = Buffer.concat(chunks);
  if (String(req.headers["x-body-encoding"] ?? "").toLowerCase() === "gzip") {
    try {
      raw = gunzipSync(raw, { maxOutputLength: MAX_JSON_BYTES });
    } catch {
      return undefined;
    }
  }

  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Last-Event-ID from the header, which is where a resume puts it. */
export function lastEventIdOf(req: IncomingMessage): number {
  const header = Number(req.headers["last-event-id"] ?? 0);
  return Number.isFinite(header) && header > 0 ? header : 0;
}
