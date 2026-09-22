import * as XLSX from "xlsx";
import { FIELDS } from "./schema";
import type { Flag, LocationRow } from "./types";

function cellValue(row: LocationRow, field: (typeof FIELDS)[number]) {
  const cell = row[field.id];
  return cell.value ?? "";
}

function toAoA(rows: LocationRow[]): (string | number | boolean)[][] {
  const header = FIELDS.map((f) => f.label);
  const body = rows.map((row) => FIELDS.map((f) => cellValue(row, f) as string | number | boolean));
  return [header, ...body];
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 60) || "schedule";
}

export function exportXlsx(rows: LocationRow[], flags: Flag[], fileName: string) {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toAoA(rows)), "Schedule");

  const flagSheet = [
    ["Row", "Field", "Level", "Issue"],
    ...flags.map((f) => [f.rowKey, f.field ?? "", f.level, f.message]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(flagSheet), "Flags");

  const sourceSheet = [
    ["Row", "Field", "Value", "Raw", "Source", "Confidence"],
    ...rows.flatMap((row) =>
      FIELDS.map((f) => {
        const cell = row[f.id];
        const src = cell.source;
        const where = !src
          ? cell.raw === "(derived)" || cell.raw === "(assumed)"
            ? cell.raw
            : ""
          : src.kind === "sheet"
            ? `${src.sheet}!${src.a1}`
            : `page ${src.page}, line ${src.line}`;
        return [row.key, f.label, cell.value ?? "", cell.raw, where, cell.confidence];
      }),
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sourceSheet), "Provenance");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${baseName(fileName)}-normalized.xlsx`,
  );
}

export function exportCsv(rows: LocationRow[], fileName: string) {
  const sheet = XLSX.utils.aoa_to_sheet(toAoA(rows));
  const csv = XLSX.utils.sheet_to_csv(sheet);
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${baseName(fileName)}-normalized.csv`);
}

export function exportJson(rows: LocationRow[], flags: Flag[], fileName: string) {
  const payload = {
    source: fileName,
    generatedAt: new Date().toISOString(),
    locations: rows.map((row) => ({
      key: row.key,
      fields: Object.fromEntries(
        FIELDS.map((f) => [
          f.id,
          {
            value: row[f.id].value,
            raw: row[f.id].raw,
            source: row[f.id].source,
            confidence: row[f.id].confidence,
            edited: row[f.id].edited ?? false,
          },
        ]),
      ),
    })),
    flags,
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `${baseName(fileName)}-normalized.json`,
  );
}
