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

const MAX_BODY_BYTES = 12 * 1024 * 1024;

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("Body too large");
    chunks.push(buf);
  }

  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}
