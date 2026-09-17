import fs from "node:fs";
import Papa from "papaparse";
import type { RawTable } from "./types";

export function parseCsv(path: string): RawTable {
  const content = fs.readFileSync(path, "utf-8");
  const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields ?? [], rows: result.data };
}
