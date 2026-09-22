import { parsePdf } from "./pdf";
import { parseWorkbook } from "./sheet";
import type { ParsedFile } from "../types";

export async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) return parsePdf(buffer, file.name);
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
    return parseWorkbook(buffer, file.name);
  }

  throw new Error(`Unsupported file type. Drop an .xlsx, .xls, .csv or .pdf.`);
}

export { parsePdf, parseWorkbook };
