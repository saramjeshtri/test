/**
 * Regenerates public/data/values.json -- the file the existing 3D map
 * (components/CityMap.tsx) already reads for its zone cards -- from the
 * real fused data instead of the old placeholder numbers. CityMap.tsx is
 * untouched; only the data file it fetches changes.
 *
 * Run after `npm run fusion:run` (or via `npm run fusion:sync-map`, which
 * does both).
 */
import fs from "node:fs";
import path from "node:path";
import { computeZoneStats } from "../lib/commandCenter/aggregate";
import type { CanonicalRequest } from "../lib/fusion/schema";
import type { CanonicalBudgetRow } from "../lib/fusion/parsers/budgetParser";

const OUT_DIR = path.join(process.cwd(), "fixtures/canonical-output");
const VALUES_PATH = path.join(process.cwd(), "public/data/values.json");

function colorAndLabelFor(score: number): { color: number[]; label: string } {
  if (score >= 75) return { color: [239, 68, 68], label: "Kritike" };
  if (score >= 50) return { color: [245, 158, 11], label: "Vëmendje" };
  return { color: [34, 197, 94], label: "Normale" };
}

function main() {
  const records: CanonicalRequest[] = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "requests.json"), "utf-8")
  );
  const budgetRows: CanonicalBudgetRow[] = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "budget.json"), "utf-8")
  );

  const zones = computeZoneStats(records, budgetRows);

  const values = zones.map((z) => {
    const { color, label } = colorAndLabelFor(z.severityScore);
    return { areaId: z.zoneId, value: z.severityScore, color, label };
  });

  fs.writeFileSync(VALUES_PATH, JSON.stringify(values, null, 2) + "\n");
  console.log(`Wrote ${values.length} zone values to ${path.relative(process.cwd(), VALUES_PATH)} (from real fused data):`);
  console.table(values.map((v) => ({ zone: v.areaId, severity: v.value, label: v.label })));
}

main();
