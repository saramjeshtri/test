import fs from "node:fs";
import path from "node:path";
import { parseExcel } from "../lib/fusion/parsers/excelParser";
import { parseCsv } from "../lib/fusion/parsers/csvParser";
import { parsePdf } from "../lib/fusion/parsers/pdfParser";
import { parseLegacy } from "../lib/fusion/parsers/legacyParser";
import { parseBudget } from "../lib/fusion/parsers/budgetParser";
import { fuseAll } from "../lib/fusion/mergeEngine";

const RAW = path.join(process.cwd(), "fixtures/raw-sources");
const OUT = path.join(process.cwd(), "fixtures/canonical-output");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const excel = parseExcel(path.join(RAW, "1_excel_drejtoria_infrastruktures.xlsx"));
  const csv = parseCsv(path.join(RAW, "2_csv_citizen_portal.csv"));
  const pdf = await parsePdf(path.join(RAW, "3_pdf_raport_mujor_sherbime.pdf"));
  const legacy = parseLegacy(path.join(RAW, "4_legacy_munsys_export.txt"));

  const { records, mappingReport } = await fuseAll([
    { sourceSystem: "1_excel_drejtoria_infrastruktures.xlsx", table: excel },
    { sourceSystem: "2_csv_citizen_portal.csv", table: csv },
    { sourceSystem: "3_pdf_raport_mujor_sherbime.pdf", table: pdf },
    { sourceSystem: "4_legacy_munsys_export.txt", table: legacy },
  ]);

  const budget = parseBudget(path.join(RAW, "5_budget_allocation.csv"));

  fs.writeFileSync(path.join(OUT, "requests.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(OUT, "budget.json"), JSON.stringify(budget, null, 2));
  fs.writeFileSync(path.join(OUT, "mapping-report.json"), JSON.stringify(mappingReport, null, 2));

  console.log(`\nFused ${records.length} records from 4 sources.\n`);

  console.log("--- Header mapping per source ---");
  for (const [source, mapping] of Object.entries(mappingReport)) {
    console.log(`\n${source}`);
    for (const m of mapping) {
      const conf = m.confidence.toFixed(2);
      console.log(`  "${m.sourceHeader}" -> ${m.canonicalField ?? "UNMAPPED"}  (${m.method}, conf ${conf})`);
    }
  }

  const flagged = records.filter((r) => r.data_quality_flags.length > 0);
  console.log(`\n${flagged.length} / ${records.length} records carry data-quality flags (expected -- not every source tracks every field).`);
  console.log("Sample flagged record:", flagged[0]);

  const zoneCounts: Record<string, number> = {};
  for (const r of records) {
    const z = r.zone_id ?? "UNRESOLVED";
    zoneCounts[z] = (zoneCounts[z] ?? 0) + 1;
  }
  console.log("\nRecords per zone:", zoneCounts);

  const unresolvedZone = records.filter((r) => r.zone_id === null).length;
  const unresolvedStatus = records.filter((r) => r.status === null).length;
  console.log(`\nSanity check -- unresolved zone_id: ${unresolvedZone}, unresolved status: ${unresolvedStatus}`);

  console.log(`\nBudget rows (${budget.length}):`);
  console.table(budget);

  console.log(`\nOutput written to ${path.relative(process.cwd(), OUT)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
