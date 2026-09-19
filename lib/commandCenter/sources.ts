import fs from "node:fs";
import path from "node:path";
import type { HeaderMappingResult } from "@/lib/fusion/mergeEngine";
import type { CanonicalRequest } from "@/lib/fusion/schema";
import type { CanonicalBudgetRow } from "@/lib/fusion/parsers/budgetParser";

export interface SourceSummary {
  file: string;
  kind: "excel" | "csv" | "pdf" | "legacy";
  records: number;
  mapping: HeaderMappingResult[];
  methods: { exact: number; fuzzy: number; llm: number; unmatched: number };
  /** field -> number of records from this source that lack it */
  gaps: Record<string, number>;
}

export interface SourcesData {
  sources: SourceSummary[];
  budget: { file: string; rows: number };
  totalRecords: number;
  llmCalls: number;
  unmappedColumns: number;
}

function kindOf(file: string): SourceSummary["kind"] {
  if (file.endsWith(".xlsx")) return "excel";
  if (file.endsWith(".pdf")) return "pdf";
  if (file.endsWith(".txt")) return "legacy";
  return "csv";
}

export function loadSourcesData(): SourcesData {
  const dir = path.join(process.cwd(), "fixtures/canonical-output");
  const records: CanonicalRequest[] = JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf-8"));
  const report: Record<string, HeaderMappingResult[]> = JSON.parse(
    fs.readFileSync(path.join(dir, "mapping-report.json"), "utf-8")
  );
  const budget: CanonicalBudgetRow[] = JSON.parse(fs.readFileSync(path.join(dir, "budget.json"), "utf-8"));

  const sources: SourceSummary[] = Object.entries(report).map(([file, mapping]) => {
    const own = records.filter((r) => r.source_system === file);
    const methods = { exact: 0, fuzzy: 0, llm: 0, unmatched: 0 };
    for (const m of mapping) methods[m.method] += 1;
    const gaps: Record<string, number> = {};
    for (const r of own) {
      for (const flag of r.data_quality_flags) {
        const field = flag.split(":")[0];
        gaps[field] = (gaps[field] ?? 0) + 1;
      }
    }
    return { file, kind: kindOf(file), records: own.length, mapping, methods, gaps };
  });

  return {
    sources,
    budget: { file: "5_budget_allocation.csv", rows: budget.length },
    totalRecords: records.length,
    llmCalls: sources.reduce((a, s) => a + s.methods.llm, 0),
    unmappedColumns: sources.reduce((a, s) => a + s.methods.unmatched, 0),
  };
}
