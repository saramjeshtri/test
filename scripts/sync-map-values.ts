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
import { severityToRgb, severityLabel, severityDomain } from "../lib/commandCenter/severityColor";
import type { CanonicalRequest } from "../lib/fusion/schema";
import type { CanonicalBudgetRow } from "../lib/fusion/parsers/budgetParser";

const OUT_DIR = path.join(process.cwd(), "fixtures/canonical-output");
const VALUES_PATH = path.join(process.cwd(), "public/data/values.json");

// Continuous gradient (forest -> brown -> critical rust), shared with the
// UI via lib/commandCenter/severityColor.ts -- a fixed 3-bucket scheme made
// every zone in this dataset look the same color, since all six current
// severity scores land in the same middle bucket.
function colorAndLabelFor(score: number, domain: [number, number]): { color: number[]; label: string } {
  return { color: [...severityToRgb(score, domain)], label: severityLabel(score) };
}

function main() {
  const records: CanonicalRequest[] = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "requests.json"), "utf-8")
  );
  const budgetRows: CanonicalBudgetRow[] = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "budget.json"), "utf-8")
  );

  const zones = computeZoneStats(records, budgetRows);
  const domain = severityDomain(zones.map((z) => z.severityScore));

  const values = zones.map((z) => {
    const { color, label } = colorAndLabelFor(z.severityScore, domain);
    return { areaId: z.zoneId, value: z.severityScore, color, label };
  });

  fs.writeFileSync(VALUES_PATH, JSON.stringify(values, null, 2) + "\n");
  console.log(`Wrote ${values.length} zone values to ${path.relative(process.cwd(), VALUES_PATH)} (from real fused data):`);
  console.table(values.map((v) => ({ zone: v.areaId, severity: v.value, label: v.label })));
}

main();
