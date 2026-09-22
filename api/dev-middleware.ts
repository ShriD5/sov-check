import type { Plugin } from "vite";
import { handleExtract, handleStream, type MiniRes } from "./_handlers.js";
import { nodeRes, readJson } from "./_node.js";

/**
 * Serves the same handlers Vercel will run, inside `vite dev`, so there is one
 * implementation and local behaviour matches production.
 */
export function devApi(): Plugin {
  return {
    name: "sov-check-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/extract" && req.method === "POST") {
          const body = await readJson(req);
          const mini: MiniRes = nodeRes(res);
          handleExtract(body, mini);
          return;
        }

        if (url.pathname === "/api/stream") {
          const headerId = Number(req.headers["last-event-id"] ?? 0);
          const queryId = Number(url.searchParams.get("lastEventId") ?? 0);
          const mini: MiniRes = nodeRes(res);
          handleStream(
            {
              runId: url.searchParams.get("runId"),
              lastEventId:
                Number.isFinite(headerId) && headerId > 0 ? headerId : Math.max(0, queryId || 0),
            },
            mini,
          );
          return;
        }

        next();
      });
    },
  };
}
