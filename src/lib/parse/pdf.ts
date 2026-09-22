import type { ParsedFile, RawRow, SourceRef } from "../types";

interface Word {
  text: string;
  x: number;
  y: number;
  width: number;
}

/** Minimal shape of the pdf.js objects we touch, so Node and the browser can each bring their own build. */
export interface PdfLikeDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

/** Groups words whose baselines are within this many points into one line. */
const LINE_TOLERANCE = 3;

function toLines(words: Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Word[][] = [];

  for (const word of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - word.y) <= LINE_TOLERANCE);
    if (line) line.push(word);
    else lines.push([word]);
  }

  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Infers column boundaries from the header line's word positions, then slots
 * every later line's words into those columns by x overlap. This is the part
 * a naive "extract the text" approach gets wrong: without column geometry, a
 * blank cell shifts every value after it one column to the left.
 */
function columnsFromHeader(headerLine: Word[]): { label: string; start: number; end: number }[] {
  return headerLine.map((word, i) => {
    const next = headerLine[i + 1];
    return {
      label: word.text,
      start: word.x - 2,
      end: next ? (word.x + word.width + next.x) / 2 : word.x + word.width + 60,
    };
  });
}

function mergeHeaderWords(line: Word[]): Word[] {
  // "Year Built" arrives as two runs; join neighbours that nearly touch.
  const out: Word[] = [];
  for (const word of line) {
    const prev = out[out.length - 1];
    if (prev && word.x - (prev.x + prev.width) < 6) {
      prev.text = `${prev.text} ${word.text}`;
      prev.width = word.x + word.width - prev.x;
    } else {
      out.push({ ...word });
    }
  }
  return out;
}

const HEADER_WORDS = /\b(loc|address|city|state|zip|tiv|value|year|constr|sq|contents|bldg)\b/i;

export async function extractFromPdfDocument(
  doc: PdfLikeDocument,
  fileName: string,
): Promise<ParsedFile> {
  const notes: string[] = [];
  const rows: RawRow[] = [];
  let headers: string[] = [];
  let ordinal = 0;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    const words: Word[] = content.items
      .filter(
        (item): item is { str: string; transform: number[]; width: number } =>
          typeof item === "object" &&
          item !== null &&
          "str" in item &&
          typeof (item as { str: unknown }).str === "string",
      )
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      }))
      .filter((w) => w.text.length > 0);

    if (!words.length) continue;

    const lines = toLines(words);
    const headerIndex = lines.findIndex(
      (l) => l.filter((w) => HEADER_WORDS.test(w.text)).length >= 3,
    );

    if (headerIndex === -1) {
      notes.push(`Page ${pageNo}: no table header found, page skipped`);
      continue;
    }

    const headerLine = mergeHeaderWords(lines[headerIndex]);
    const cols = columnsFromHeader(headerLine);
    if (!headers.length) headers = cols.map((c) => c.label);

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const cells: Record<string, string> = {};
      const refs: Record<string, SourceRef> = {};

      for (const col of cols) {
        cells[col.label] = "";
        refs[col.label] = { kind: "pdf", page: pageNo, line: i + 1 };
      }

      for (const word of line) {
        const center = word.x + word.width / 2;
        const col =
          cols.find((c) => center >= c.start && center < c.end) ??
          cols.find((c) => word.x >= c.start && word.x < c.end);
        if (!col) continue;
        cells[col.label] = cells[col.label] ? `${cells[col.label]} ${word.text}` : word.text;
      }

      if (Object.values(cells).filter(Boolean).length < 2) continue;
      if (Object.values(cells).some((v) => /^(grand\s+)?total\b/i.test(v))) continue;

      rows.push({ index: ordinal++, sheet: `page ${pageNo}`, cells, refs });
    }
  }

  notes.push(
    `${doc.numPages} page(s) read from the PDF text layer, column positions inferred from the header row`,
  );

  return { fileName, kind: "pdf", sheets: [], headers, rows, notes };
}

/** Browser entry point. Node callers use `extractFromPdfDocument` with the legacy build. */
export async function parsePdf(buffer: ArrayBuffer, fileName: string): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  return extractFromPdfDocument(doc as unknown as PdfLikeDocument, fileName);
}
