import { parsePdf } from "./pdf.js";
import { parseWorkbook } from "./sheet.js";
import type { ParsedFile } from "../types.js";

export async function parseFile(
  file: File,
  onProgress?: (page: number, pages: number) => void,
): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) return parsePdf(buffer, file.name, onProgress);
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
    return parseWorkbook(buffer, file.name);
  }

  throw new Error(`Unsupported file type. Drop an .xlsx, .xls, .csv or .pdf.`);
}

export { parsePdf, parseWorkbook };
