import { useCallback, useRef, useState } from "react";
import { parseFile } from "../lib/parse";
import { useRun } from "../store/runStore";

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
        const parsed = await parseFile(file);
        if (!parsed.rows.length) throw new Error("No data rows found. Is the header row missing?");
        setParsed(parsed);
      } catch (error) {
        useRun.setState({
          phase: "error",
          error: error instanceof Error ? error.message : "Could not read that file",
        });
      } finally {
        setBusy(false);
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
          {busy ? "Reading the file..." : "Drop a Statement of Values"}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          .xlsx, .xls, .csv or .pdf. Parsed in your browser, nothing is stored.
        </p>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Or try a sample
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
