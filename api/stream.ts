import type { IncomingMessage, ServerResponse } from "node:http";
import { handleStream, type MiniRes } from "./_handlers.js";
import { lastEventIdOf, nodeRes, readJson } from "./_node.js";

export const config = { maxDuration: 60 };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const mini: MiniRes = nodeRes(res);

  if (req.method !== "POST") {
    mini.status(405);
    mini.header("content-type", "application/json");
    mini.end(JSON.stringify({ error: "POST only" }));
    return;
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    mini.status(413);
    mini.header("content-type", "application/json");
    mini.end(JSON.stringify({ error: "That file is too large for this demo." }));
    return;
  }

  handleStream(body, mini, lastEventIdOf(req));
}
