import type { IncomingMessage, ServerResponse } from "node:http";
import { handleStream, type MiniRes } from "./_handlers.js";
import { nodeRes } from "./_node.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const headerId = Number(req.headers["last-event-id"] ?? 0);
  const queryId = Number(url.searchParams.get("lastEventId") ?? 0);

  const mini: MiniRes = nodeRes(res);
  handleStream(
    {
      runId: url.searchParams.get("runId"),
      lastEventId: Number.isFinite(headerId) && headerId > 0 ? headerId : Math.max(0, queryId || 0),
    },
    mini,
  );
}
