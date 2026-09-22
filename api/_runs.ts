import { buildEvents } from "../src/lib/engine.js";
import type { ExtractRequest, StreamEvent } from "../src/lib/types.js";

export interface Run {
  id: string;
  events: StreamEvent[];
  createdAt: number;
  chaosDropAfter?: number;
  chaosTruncateAfter?: number;
  /** Set once a reconnect has already consumed the chaos budget. */
  chaosSpent: boolean;
}

const TTL_MS = 15 * 60 * 1000;
const MAX_RUNS = 200;

/**
 * Runs live in memory for the length of a session. Nothing about an uploaded
 * file is written to disk or to a database; when the TTL passes or the
 * instance recycles, the run is gone.
 */
const runs = new Map<string, Run>();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, run] of runs) if (run.createdAt < cutoff) runs.delete(id);
  while (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next().value;
    if (!oldest) break;
    runs.delete(oldest);
  }
}

export function createRun(req: ExtractRequest): Run {
  sweep();
  const run: Run = {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    events: buildEvents(req),
    createdAt: Date.now(),
    chaosDropAfter: req.chaosDropAfter,
    chaosTruncateAfter: req.chaosTruncateAfter,
    chaosSpent: false,
  };
  runs.set(run.id, run);
  return run;
}

export function getRun(id: string): Run | undefined {
  sweep();
  return runs.get(id);
}
