import fs from "node:fs";
import Papa from "papaparse";
import { resolveZoneId } from "../valueNormalizers";

export interface CanonicalBudgetRow {
  zone_id: string | null;
  population: number;
  annual_budget_leke: number;
  spent_ytd_leke: number;
  source_row_ref: string;
}

/** Budget rows are already structured (no field-name fusion needed) -- just
 *  the zone reference needs resolving, since this file uses yet another
 *  naming convention ("Lagjja Nr. N") than the request sources. */
export function parseBudget(path: string): CanonicalBudgetRow[] {
  const content = fs.readFileSync(path, "utf-8");
  const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
  const fileName = path.split("/").pop();

  return result.data.map((row, i) => ({
    zone_id: resolveZoneId(row["zone_ref"] ?? ""),
    population: Number(row["population"]),
    annual_budget_leke: Number(row["annual_budget_leke"]),
    spent_ytd_leke: Number(row["spent_ytd_leke"]),
    source_row_ref: `${fileName}#${i + 2}`,
  }));
}
