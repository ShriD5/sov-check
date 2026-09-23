/**
 * Dumps the raw pdf.js text items for one page: y, x, width, text.
 * Used to see why a real PDF's columns come out wrong.
 *
 *   npx tsx scripts/pdf-geometry.ts fixtures/real/mississippi.pdf 1 80
 */
import { readFileSync } from "node:fs";

async function main() {
  const [path, pageArg = "1", limitArg = "80"] = process.argv.slice(2);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const page = await doc.getPage(Number(pageArg));
  const content = await page.getTextContent();

  const items = (content.items as { str?: string; transform?: number[]; width?: number }[])
    .filter((i) => i.str && i.str.trim() && i.transform)
    .map((i) => ({
      s: i.str!,
      x: Math.round(i.transform![4]),
      y: Math.round(i.transform![5]),
      w: Math.round(i.width ?? 0),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  console.log(`page ${pageArg} of ${doc.numPages}, ${items.length} items`);
  for (const it of items.slice(0, Number(limitArg))) {
    console.log(`${String(it.y).padStart(4)} ${String(it.x).padStart(4)} w${String(it.w).padStart(4)}  ${JSON.stringify(it.s)}`);
  }
}

void main();
