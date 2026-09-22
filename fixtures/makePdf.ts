/**
 * Minimal PDF writer: positioned text only, one page per chunk of rows.
 * Enough to produce a real text layer for the PDF fixture without pulling in
 * a PDF library just to generate test data.
 */

interface Word {
  text: string;
  x: number;
  y: number;
  size?: number;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function makePdf(pages: Word[][], width = 792, height = 612): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];

  // 1 = catalog, 2 = pages, 3 = font, then per page: content, page
  let nextId = 4;

  const contentIds: number[] = [];
  for (const words of pages) {
    const stream = words
      .map(
        (w) =>
          `BT /F1 ${w.size ?? 9} Tf 1 0 0 1 ${w.x.toFixed(2)} ${w.y.toFixed(2)} Tm (${escapeText(w.text)}) Tj ET`,
      )
      .join("\n");
    const contentId = nextId++;
    contentIds.push(contentId);
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  }

  for (const contentId of contentIds) {
    const pageId = nextId++;
    pageIds.push(pageId);
    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] =
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let id = 1; id < nextId; id++) {
    offsets[id] = pdf.length;
    pdf += objects[id];
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/** Lays a table out with fixed column x positions, paginating as needed. */
export function tableToPdf(
  headers: { label: string; x: number }[],
  rows: string[][],
  rowsPerPage = 18,
): Uint8Array {
  const pages: Word[][] = [];
  const top = 560;
  const lineHeight = 18;

  for (let start = 0; start < rows.length; start += rowsPerPage) {
    const words: Word[] = [
      { text: "Statement of Values", x: 40, y: top + 24, size: 13 },
      ...headers.map((h) => ({ text: h.label, x: h.x, y: top, size: 9 })),
    ];

    rows.slice(start, start + rowsPerPage).forEach((row, i) => {
      const y = top - lineHeight * (i + 1);
      row.forEach((value, c) => {
        if (!value) return;
        words.push({ text: value, x: headers[c].x, y, size: 9 });
      });
    });

    pages.push(words);
  }

  return makePdf(pages);
}
