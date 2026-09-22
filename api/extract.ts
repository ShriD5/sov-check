import type { IncomingMessage, ServerResponse } from "node:http";
import { handleExtract, type MiniRes } from "./_handlers";
import { nodeRes, readJson } from "./_node";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "POST only" }));
    return;
  }
  const body = await readJson(req);
  const mini: MiniRes = nodeRes(res);
  handleExtract(body, mini);
}
