import * as XLSX from "xlsx";
import type { RawTable } from "./types";

export function parseExcel(path: string): RawTable {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

  const headers = (rows[0] ?? []).map((h) => String(h).trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));

  return {
    headers,
    rows: dataRows.map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()]))
    ),
  };
}
