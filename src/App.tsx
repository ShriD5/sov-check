import { DropZone } from "./components/DropZone";
import { MappingPanel } from "./components/MappingPanel";
import { ScheduleGrid } from "./components/ScheduleGrid";
import { ChaosControls, RunBar, Timeline } from "./components/RunBar";
import { FlagsPanel, SidePanel } from "./components/SidePanel";
import { parseFile } from "./lib/parse";
import { useRun } from "./store/runStore";

function PendingFilePrompt() {
  const pending = useRun((s) => s.pendingFile);
  const setPendingFile = useRun((s) => s.setPendingFile);
  const setParsed = useRun((s) => s.setParsed);
  const cancel = useRun((s) => s.cancel);

  if (!pending) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-full max-w-lg rounded-lg border border-[var(--color-warn)]/50 bg-[#1d1a12] p-4 shadow-lg">
      <p className="text-sm">
        A run is already going. What should happen to <span className="font-mono">{pending.name}</span>?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            cancel();
            const parsed = await parseFile(pending);
            setPendingFile(null);
            setParsed(parsed);
          }}
          className="rounded-md bg-[var(--color-warn)] px-3 py-1.5 text-sm font-medium text-[#1a1206]"
        >
          Cancel the run, use this file
        </button>
        <button
          onClick={() => setPendingFile(null)}
          className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-white"
        >
          Keep the current run
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const phase = useRun((s) => s.phase);
  const error = useRun((s) => s.error);
  const reset = useRun((s) => s.reset);

  const showWorkspace = ["streaming", "interrupted", "done"].includes(phase);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--color-line)] px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight">SOV Check</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Messy Statement of Values in, clean property schedule out
            </p>
          </div>
          <a
            href="https://github.com/ShriD5/sov-check"
            className="text-sm text-[var(--color-muted)] underline-offset-4 hover:text-white hover:underline"
          >
            source
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-4 px-6 py-6">
        {phase === "error" && (
          <div className="rounded-lg border border-[var(--color-bad)]/50 bg-[#241414] p-4">
            <p className="text-sm text-[var(--color-bad)]">{error}</p>
            <button onClick={reset} className="mt-2 text-sm text-[var(--color-muted)] underline">
              Start over
            </button>
          </div>
        )}

        {(phase === "idle" || phase === "parsing" || phase === "error") && (
          <div className="flex flex-1 flex-col justify-center gap-10 py-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Every location, every value, traced back to the cell it came from
              </h2>
              <p className="mt-3 text-[15px] text-[var(--color-muted)]">
                Drop a broker&apos;s SOV. Get a normalized schedule with TIV, COPE and gaps flagged,
                and click any number to see the exact row it came from. Free, no login, nothing stored.
              </p>
            </div>
            <DropZone />
            <div className="mx-auto max-w-2xl text-center text-[13px] text-[var(--color-muted)]">
              Built by <a className="underline" href="https://shrithan.site">Shrithan Devaiah</a>. Not
              affiliated with any insurance software vendor.
            </div>
          </div>
        )}

        {phase === "mapping" && <MappingPanel />}

        {showWorkspace && (
          <>
            <RunBar />
            <div className="flex min-h-0 flex-1 gap-4">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                <ScheduleGrid />
                <FlagsPanel />
              </div>
              <div className="flex flex-col gap-4">
                <SidePanel />
                <Timeline />
              </div>
            </div>
          </>
        )}

        {(phase === "idle" || phase === "mapping") && (
          <div className="mx-auto w-full max-w-5xl px-6">
            <ChaosControls />
          </div>
        )}
      </main>

      <PendingFilePrompt />
    </div>
  );
}
