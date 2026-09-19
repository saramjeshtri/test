import fs from "node:fs";
import path from "node:path";
import type { CanonicalRequest } from "@/lib/fusion/schema";
import type { CanonicalBudgetRow } from "@/lib/fusion/parsers/budgetParser";

export interface ZoneStats {
  zoneId: string;
  zoneLabel: string;
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  avgCostLeke: number | null;
  topCategory: string | null;
  budget: { population: number; allocatedLeke: number; spentLeke: number; spentPct: number } | null;
  /** 0-100. Explainable heuristic, not a prediction -- see comment below. */
  severityScore: number;
}

export interface TrendPoint {
  month: string;
  count: number;
}

export interface CommandCenterData {
  generatedAt: string;
  city: {
    totalRequests: number;
    resolvedPct: number;
    openCount: number;
    totalBudgetLeke: number;
    totalSpentLeke: number;
  };
  zones: ZoneStats[];
  trend: TrendPoint[];
  records: CanonicalRequest[];
}

const ZONE_LABELS: Record<string, string> = {
  "area-1": "Zona 1",
  "area-2": "Zona 2",
  "area-3": "Zona 3",
  "area-4": "Zona 4",
  "area-5": "Zona 5",
  "area-6": "Zona 6",
};

export function computeZoneStats(records: CanonicalRequest[], budgetRows: CanonicalBudgetRow[]): ZoneStats[] {
  return Object.keys(ZONE_LABELS).map((zoneId) => {
    const zoneRecords = records.filter((r) => r.zone_id === zoneId);
    const open = zoneRecords.filter((r) => r.status === "open").length;
    const inProgress = zoneRecords.filter((r) => r.status === "in_progress").length;
    const resolved = zoneRecords.filter((r) => r.status === "resolved").length;

    const costs = zoneRecords.map((r) => r.cost_estimate_leke).filter((c): c is number => c != null);
    const avgCostLeke = costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : null;

    const categoryCounts: Record<string, number> = {};
    for (const r of zoneRecords) {
      if (r.category) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    }
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const budgetRow = budgetRows.find((b) => b.zone_id === zoneId) ?? null;
    const budget = budgetRow
      ? {
          population: budgetRow.population,
          allocatedLeke: budgetRow.annual_budget_leke,
          spentLeke: budgetRow.spent_ytd_leke,
          spentPct: Math.round((budgetRow.spent_ytd_leke / budgetRow.annual_budget_leke) * 100),
        }
      : null;

    // Explainable heuristic, not a prediction: 60% weight on how much of this
    // zone's caseload is still open/in-progress, 40% on how much of its budget
    // is already spent (less room left to respond). Same style of model the
    // what-if simulator (next step) will build on -- simple, defensible, and
    // clearly labeled as such rather than dressed up as a forecast.
    const backlogRatio = zoneRecords.length ? (open + inProgress) / zoneRecords.length : 0;
    const budgetPressure = budget ? budget.spentPct / 100 : 0.5;
    const severityScore = Math.round(Math.min(100, backlogRatio * 60 + budgetPressure * 40));

    return {
      zoneId,
      zoneLabel: ZONE_LABELS[zoneId],
      total: zoneRecords.length,
      open,
      inProgress,
      resolved,
      avgCostLeke,
      topCategory,
      budget,
      severityScore,
    };
  });
}

export function loadCommandCenterData(): CommandCenterData {
  const outDir = path.join(process.cwd(), "fixtures/canonical-output");
  const requestsPath = path.join(outDir, "requests.json");
  const budgetPath = path.join(outDir, "budget.json");

  if (!fs.existsSync(requestsPath) || !fs.existsSync(budgetPath)) {
    throw new Error(
      "Canonical fusion output not found. Run `npm run fusion:run` first to generate fixtures/canonical-output/."
    );
  }

  const records: CanonicalRequest[] = JSON.parse(fs.readFileSync(requestsPath, "utf-8"));
  const budgetRows: CanonicalBudgetRow[] = JSON.parse(fs.readFileSync(budgetPath, "utf-8"));
  const zones = computeZoneStats(records, budgetRows);

  const totalRequests = records.length;
  const resolvedCount = records.filter((r) => r.status === "resolved").length;
  const openCount = records.filter((r) => r.status === "open").length;
  const totalBudgetLeke = budgetRows.reduce((sum, b) => sum + b.annual_budget_leke, 0);
  const totalSpentLeke = budgetRows.reduce((sum, b) => sum + b.spent_ytd_leke, 0);

  const monthCounts: Record<string, number> = {};
  for (const r of records) {
    if (!r.date_submitted) continue;
    const month = r.date_submitted.slice(0, 7); // YYYY-MM
    monthCounts[month] = (monthCounts[month] ?? 0) + 1;
  }
  const trend: TrendPoint[] = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    generatedAt: new Date().toISOString(),
    city: {
      totalRequests,
      resolvedPct: totalRequests ? Math.round((resolvedCount / totalRequests) * 100) : 0,
      openCount,
      totalBudgetLeke,
      totalSpentLeke,
    },
    zones,
    trend,
    records,
  };
}
