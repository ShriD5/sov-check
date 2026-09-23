import type { ParsedFile, RawRow, SourceRef, SourceSubtotal } from "../types.js";

interface Item {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface Column {
  label: string;
  start: number;
  end: number;
}

/** Minimal shape of the pdf.js objects we touch, so Node and the browser can each bring their own build. */
export interface PdfLikeDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

/** Items whose baselines are within this many points share a line. */
const LINE_TOLERANCE = 3;
/** A header label this far above the header line is a second tier of it, e.g. "Square" over "Footage". */
const STACKED_HEADER_GAP = 13;
/** Data this far from every header is page furniture, not a cell. */
const MAX_COLUMN_DISTANCE = 70;

const HEADER_WORDS = /\b(loc|location|address|city|state|zip|tiv|value|year|constr|construction|sq|contents|bldg|building|occupancy|footage|stories)\b/i;
const CURRENCY_ONLY = /^[$£€₹]$/;

function toLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];

  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - item.y) <= LINE_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }

  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function overlap(item: Item, col: Column): number {
  // Positive is shared width, negative is the gap between them.
  return Math.min(item.x + item.width, col.end) - Math.max(item.x, col.start);
}

/**
 * Picks the column a data item belongs to by horizontal overlap with the
 * header label, falling back to the nearest label.
 *
 * Carving fixed boundaries around each header does not survive real files:
 * headers are usually centred over their column while text is left-aligned
 * and money is right-aligned, so on the State of Mississippi's SOV an address
 * starting at x=137 sits under the gap between "Location Name" and "Address".
 * Overlap-then-nearest puts it under Address, and a right-aligned value that
 * pokes out past its centred header still lands where it belongs.
 */
function assign(item: Item, cols: Column[]): Column | null {
  let best: Column | null = null;
  let bestScore = -Infinity;
  for (const col of cols) {
    const score = overlap(item, col);
    if (score > bestScore) {
      best = col;
      bestScore = score;
    }
  }
  return bestScore >= -MAX_COLUMN_DISTANCE ? best : null;
}

/**
 * Folds a second header tier into the first: "Square" printed above "Footage"
 * becomes "Square Footage". Only lines tight above the header count, so a
 * report title a few lines higher is not glued onto a column name.
 */
function stackHeaders(lines: Item[][], headerIndex: number): Column[] {
  const header = lines[headerIndex];
  const cols: Column[] = header.map((item) => ({
    label: item.text.trim(),
    start: item.x,
    end: item.x + item.width,
  }));

  for (let i = headerIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (line[0].y - header[0].y > STACKED_HEADER_GAP) break;

    for (const word of line) {
      let target: Column | null = null;
      let most = 0;
      for (const col of cols) {
        const shared = Math.min(word.x + word.width, col.end) - Math.max(word.x, col.start);
        if (shared > most) {
          most = shared;
          target = col;
        }
      }
      if (target) target.label = `${word.text.trim()} ${target.label}`;
    }
  }

  return cols;
}

function isHeaderLine(line: Item[]): boolean {
  if (line.length < 4) return false;
  return line.filter((item) => HEADER_WORDS.test(item.text)).length >= 3;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Second pass: learn where each column's data actually sits, then use that.
 *
 * Header labels are a rough guide. On the Mississippi SOV the county "Lee" is
 * 3pt from the State Code label and 4pt from the County label, so header
 * geometry alone puts it in State and produces "MS LEE". But every county on
 * the page starts at x=363, and that is the County column. Re-deriving each
 * column's extent from the median start and end of the items first assigned
 * to it moves "Lee" where it belongs.
 */
function learnColumns(dataLines: Item[][], cols: Column[]): Column[] {
  const starts = new Map<Column, number[]>();
  const ends = new Map<Column, number[]>();

  for (const line of dataLines) {
    for (const item of line) {
      const col = assign(item, cols);
      if (!col) continue;
      (starts.get(col) ?? starts.set(col, []).get(col)!).push(item.x);
      (ends.get(col) ?? ends.set(col, []).get(col)!).push(item.x + item.width);
    }
  }

  return cols.map((col) => {
    const s = starts.get(col);
    const e = ends.get(col);
    // Too few samples to trust; keep the header's extent.
    if (!s || s.length < 3 || !e) return col;
    return {
      label: col.label,
      start: Math.min(col.start, median(s)),
      end: Math.max(col.end, median(e)),
    };
  });
}

const SUBTOTAL_LINE = /^(grand\s+)?(sub)?total\b(\s+for)?\s*(.*?)\s*:?\s*$/i;

/** Reads "Total for Yellow Creek Inland Port Authority : $98,890,533.00" into a label and its figures. */
function readSubtotal(line: Item[]): { label: string; amounts: number[] } | null {
  // A location called "Total Care Clinic" is a data row with a dozen cells; a
  // subtotal is a label and a figure or two.
  if (line.length > 5) return null;
  const labelPart = line
    .filter((item) => !/^[\s$(),.\d-]+$/.test(item.text))
    .map((item) => item.text)
    .join(" ");
  const match = labelPart.match(SUBTOTAL_LINE);
  if (!match) return null;

  const amounts = line
    .filter((item) => /^[\s$(),.\d-]+$/.test(item.text))
    .map((item) => Number(item.text.replace(/[$,()\s]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) return null;

  return { label: (match[4] || "Total").trim(), amounts };
}

export async function extractFromPdfDocument(
  doc: PdfLikeDocument,
  fileName: string,
  onProgress?: (page: number, pages: number) => void,
): Promise<ParsedFile> {
  const notes: string[] = [];
  const rows: RawRow[] = [];
  const headerSet: string[] = [];
  const subtotals: SourceSubtotal[] = [];
  let ordinal = 0;
  let blockStart = 0;
  let skipped = 0;
  let pagesWithTables = 0;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    onProgress?.(pageNo, doc.numPages);
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    const items: Item[] = content.items
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
      // A "$" printed as its own run sits between two columns and drags a
      // currency sign into the zip code. The value next to it carries the
      // meaning; the sign carries nothing.
      .filter((item) => item.text.length > 0 && !CURRENCY_ONLY.test(item.text));

    if (!items.length) continue;

    const lines = toLines(items);
    const headerIndex = lines.findIndex(isHeaderLine);

    if (headerIndex === -1) {
      skipped++;
      continue;
    }

    pagesWithTables++;
    const headerCols = stackHeaders(lines, headerIndex);
    for (const col of headerCols) if (!headerSet.includes(col.label)) headerSet.push(col.label);
    const cols = learnColumns(lines.slice(headerIndex + 1), headerCols);

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      const subtotal = readSubtotal(line);
      if (subtotal) {
        subtotals.push({
          ...subtotal,
          startRow: blockStart,
          endRow: ordinal,
          where: `page ${pageNo}, line ${i + 1}`,
        });
        blockStart = ordinal;
        continue;
      }
      const cells: Record<string, string> = {};
      const refs: Record<string, SourceRef> = {};

      for (const col of cols) {
        cells[col.label] = "";
        refs[col.label] = { kind: "pdf", page: pageNo, line: i + 1 };
      }

      for (const item of line) {
        const col = assign(item, cols);
        if (!col) continue;
        cells[col.label] = cells[col.label] ? `${cells[col.label]} ${item.text}` : item.text;
      }

      // A lone label on its own line is a group heading ("Boswell Regional
      // Center"), not a location.
      if (Object.values(cells).filter(Boolean).length < 3) continue;
      if (Object.values(cells).some((v) => /^(grand\s+)?(total|subtotal)\b/i.test(v))) continue;

      rows.push({ index: ordinal++, sheet: `page ${pageNo}`, cells, refs });
    }
  }

  notes.push(
    `${pagesWithTables} of ${doc.numPages} page(s) had a table; columns assigned by overlap with the header row`,
  );
  if (skipped) notes.push(`${skipped} page(s) with no table header skipped (cover pages, forms, loss runs)`);
  if (subtotals.length) notes.push(`${subtotals.length} subtotal line(s) in the source, kept for reconciliation`);

  return { fileName, kind: "pdf", sheets: [], headers: headerSet, rows, notes, subtotals };
}

/** Browser entry point. Node callers use `extractFromPdfDocument` with the legacy build. */
export async function parsePdf(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (page: number, pages: number) => void,
): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  return extractFromPdfDocument(doc as unknown as PdfLikeDocument, fileName, onProgress);
}
