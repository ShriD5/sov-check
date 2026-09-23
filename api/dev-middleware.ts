import type { Plugin } from "vite";
import { handleStream, type MiniRes } from "./_handlers.js";
import { lastEventIdOf, nodeRes, readJson } from "./_node.js";

/**
 * Serves the same handler Vercel will run, inside `vite dev`, so there is one
 * implementation and local behaviour matches production.
 */
export function devApi(): Plugin {
  return {
    name: "sov-check-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/stream") return next();

        const mini: MiniRes = nodeRes(res);
        if (req.method !== "POST") {
          mini.status(405);
          mini.end(JSON.stringify({ error: "POST only" }));
          return;
        }

        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          mini.status(413);
          mini.end(JSON.stringify({ error: "That file is too large for this demo." }));
          return;
        }
        handleStream(body, mini, lastEventIdOf(req));
      });
    },
  };
}
