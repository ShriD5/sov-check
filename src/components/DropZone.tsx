import { useCallback, useRef, useState } from "react";
import { parseFile } from "../lib/parse/index.js";
import { useRun } from "../store/runStore.js";

const REAL_SAMPLES = [
  {
    file: "state-of-mississippi-sov.pdf",
    label: "State of Mississippi",
    detail: "3,861 buildings, 79 pages",
    source:
      "https://www.dfa.ms.gov/sites/default/files/State%20Property%20Insurance%20Home/EIS%20SOV%20Report%2009102026.pdf",
  },
  {
    file: "town-of-ware-ma-rfq.pdf",
    label: "Town of Ware, MA",
    detail: "SOV buried in a 150-page RFQ",
    source:
      "https://cms1files.revize.com/warema/2-Town%20of%20Ware%20RFQ%20Insurance%20Addendum%201%2003-05-2024.pdf",
  },
];

const SAMPLES = [
  { file: "01-clean.xlsx", label: "Clean template" },
  { file: "02-merged-header.xlsx", label: "Two-tier header" },
  { file: "03-split-tiv.xlsx", label: "TIV split across columns" },
  { file: "04-multi-sheet.xlsx", label: "One sheet per state" },
  { file: "05-thousands.xlsx", label: "Values in $000s" },
  { file: "06-table.pdf", label: "PDF table" },
];

export function DropZone() {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ page: number; pages: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const setParsed = useRun((s) => s.setParsed);
  const setPhase = useRun((s) => s.setPhase);
  const phase = useRun((s) => s.phase);
  const setPendingFile = useRun((s) => s.setPendingFile);

  const ingest = useCallback(
    async (file: File) => {
      // A drop during a live run is a decision, not an accident.
      if (phase === "streaming" || phase === "interrupted") {
        setPendingFile(file);
        return;
      }

      setBusy(true);
      setPhase("parsing");
      try {
        const parsed = await parseFile(file, (page, pages) => setProgress({ page, pages }));
        if (!parsed.rows.length) throw new Error("No data rows found. Is the header row missing?");
        setParsed(parsed);
      } catch (error) {
        useRun.setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Could not read that file",
        });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [phase, setParsed, setPendingFile, setPhase],
  );

  const loadSample = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/samples/${name}`);
        if (!res.ok) throw new Error(`Sample ${name} is not available`);
        const blob = await res.blob();
        await ingest(new File([blob], name));
      } catch (error) {
        useRun.setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Sample failed to load",
        });
      } finally {
        setBusy(false);
      }
    },
    [ingest],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void ingest(file);
        }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-8 py-16 text-center transition ${
          dragging ? "border-[var(--color-accent)] bg-[#12202f]" : "border-[var(--color-line)] bg-[var(--color-panel)]"
        }`}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ingest(file);
            e.target.value = "";
          }}
        />
        <p className="text-lg font-medium">
          {progress
            ? `Reading page ${progress.page} of ${progress.pages}...`
            : busy
              ? "Reading the file..."
              : "Drop a Statement of Values"}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          .xlsx, .xls, .csv or .pdf. Parsed in your browser, nothing is stored.
        </p>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Real public SOVs, published with insurance RFPs
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {REAL_SAMPLES.map((sample) => (
            <div
              key={sample.file}
              className="flex items-center justify-between rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2"
            >
              <button
                onClick={() => void loadSample(sample.file)}
                disabled={busy}
                className="text-left disabled:opacity-50"
              >
                <span className="block text-sm text-white hover:text-[var(--color-accent)]">{sample.label}</span>
                <span className="block text-xs text-[var(--color-muted)]">{sample.detail}</span>
              </button>
              <a
                href={sample.source}
                target="_blank"
                rel="noreferrer"
                className="ml-3 shrink-0 text-xs text-[var(--color-muted)] underline-offset-2 hover:text-white hover:underline"
              >
                original
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Synthetic edge cases
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLES.map((sample) => (
            <button
              key={sample.file}
              onClick={() => void loadSample(sample.file)}
              disabled={busy}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-sm text-[#cfd6e2] transition hover:border-[var(--color-accent)] hover:text-white disabled:opacity-50"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
