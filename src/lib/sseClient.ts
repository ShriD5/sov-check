import type { StreamEvent } from "./types.js";

export interface StreamHandle {
  /** Cancels the run. Safe to call repeatedly. */
  cancel(reason?: string): void;
}

export interface StreamCallbacks {
  onEvent(event: StreamEvent, id: number): void;
  /** Fired when the transport dies and we are about to retry. */
  onInterrupt(info: { lastEventId: number; attempt: number; reason: string }): void;
  onResume(info: { lastEventId: number; attempt: number }): void;
  onDone(): void;
  onFatal(message: string): void;
}

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 400;

/**
 * SSE over fetch rather than EventSource, for three reasons the browser API
 * cannot give us: an AbortController so a superseded run stops immediately,
 * an explicit Last-Event-ID we control on every retry, and a bounded backoff
 * instead of EventSource's infinite reconnect.
 */
export function streamRun(runId: string, callbacks: StreamCallbacks): StreamHandle {
  let cancelled = false;
  let lastEventId = 0;
  let attempt = 0;
  let controller: AbortController | null = null;

  const cancel = (reason = "cancelled") => {
    if (cancelled) return;
    cancelled = true;
    controller?.abort(reason);
  };

  const connect = async (): Promise<void> => {
    if (cancelled) return;

    controller = new AbortController();
    let sawTerminal = false;

    try {
      const response = await fetch(
        `/api/stream?runId=${encodeURIComponent(runId)}&lastEventId=${lastEventId}`,
        {
          signal: controller.signal,
          headers: lastEventId > 0 ? { "Last-Event-ID": String(lastEventId) } : {},
        },
      );

      if (response.status === 404) {
        callbacks.onFatal("That run expired on the server. Drop the file again.");
        return;
      }
      if (!response.ok || !response.body) {
        throw new Error(`Stream responded ${response.status}`);
      }

      if (attempt > 0) callbacks.onResume({ lastEventId, attempt });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let split: number;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);

          let id = lastEventId;
          let data = "";

          for (const line of frame.split("\n")) {
            if (line.startsWith("id:")) id = Number(line.slice(3).trim());
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }

          if (!data) continue;

          const event = JSON.parse(data) as StreamEvent;
          lastEventId = id;

          if (event.type === "error" && event.retryable) {
            // Server truncated itself. Not fatal: reconnect and continue.
            throw new Error(event.message);
          }

          callbacks.onEvent(event, id);

          if (event.type === "done") {
            sawTerminal = true;
            callbacks.onDone();
            return;
          }
          if (event.type === "error") {
            sawTerminal = true;
            callbacks.onFatal(event.message);
            return;
          }
        }
      }

      if (cancelled || sawTerminal) return;

      // Body closed without a terminal event: the connection dropped.
      throw new Error("Connection closed before the schedule finished");
    } catch (error) {
      if (cancelled) return;

      attempt += 1;
      const reason = error instanceof Error ? error.message : "Stream failed";

      if (attempt > MAX_ATTEMPTS) {
        callbacks.onFatal(`${reason}. Gave up after ${MAX_ATTEMPTS} retries.`);
        return;
      }

      callbacks.onInterrupt({ lastEventId, attempt, reason });
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, Math.min(backoff, 4000)));
      return connect();
    }
  };

  void connect();

  return { cancel };
}
