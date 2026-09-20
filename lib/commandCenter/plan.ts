import type { CanonicalPriority, CanonicalRequest } from "@/lib/fusion/schema";
import type { CommandCenterData, ZoneStats } from "./aggregate";
import { latestDate } from "./insights";
import { CATEGORY_LABEL, PRIORITY_LABEL, zoneLabel } from "./labels";
import { scoreSeverity } from "./score";
import { severityDomain } from "./severityColor";

/**
 * Work plan: given a budget for the month, decide what to fix first and how much each zone needs.
 *
 * Deliberately simple and explainable -- a ranking and a greedy fill, not an optimiser:
 *  1. Urgent (high-priority) requests always come first. Within each group, requests are ranked by
 *     an urgency score: priority, how long it has been waiting, and how pressed its zone is
 *     compared with the others (the same risk score as the dashboard).
 *  2. Requests are funded from the top of that ranking. One that doesn't fit the money left is
 *     skipped and the next is tried, so the budget isn't left idle.
 *  3. What each zone "gets" is simply the cost of the requests funded in it, and the zones are
 *     re-scored with the dashboard's own formula to show what the plan changes.
 * Costs: the request's own estimate, else its zone's average, else the city's, else a default.
 */

export const STEP_LEKE = 50_000;
const FALLBACK_COST = 200_000;
const DAY = 86_400_000;
const parse = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const PRIORITY_POINTS: Record<CanonicalPriority, number> = { high: 40, medium: 25, low: 10 };
const UNKNOWN_PRIORITY_POINTS = 18; // some sources don't track priority at all

export interface PlanItem {
  rank: number;
  record: CanonicalRequest;
  zoneId: string;
  zoneLabel: string;
  cost: number;
  estimated: boolean;
  waitingDays: number | null;
  urgency: number;
  /** Why it ranks where it does, in a few words. */
  why: string[];
}

export interface ZonePlan {
  zoneId: string;
  zoneLabel: string;
  amountLeke: number;
  requests: number;
  pendingBefore: number;
  pendingAfter: number;
  riskBefore: number;
  riskAfter: number;
}

export interface Plan {
  budgetLeke: number;
  fundedLeke: number;
  leftoverLeke: number;
  funded: PlanItem[];
  unfunded: PlanItem[];
  unfundedLeke: number;
  /** What it would take to close every high-priority request still open. */
  urgentNeedLeke: number;
  /** Zones that receive money, biggest first. */
  zones: ZonePlan[];
  /** Every zone as it would look once the plan is done -- feeds the list, the map and the KPIs. */
  afterZones: ZoneStats[];
  cityPendingBefore: number;
  cityPendingAfter: number;
}

const cityAvgCost = (records: CanonicalRequest[]) => {
  const known = records.map((r) => r.cost_estimate_leke).filter((c): c is number => c != null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

/** Every open request, ranked by urgency (best first), with its cost and the reasons. */
export function rankRequests(data: CommandCenterData): PlanItem[] {
  const asOfStr = latestDate(data.records);
  const asOf = asOfStr ? parse(asOfStr) : null;
  const domain = severityDomain(data.zones.map((z) => z.severityScore));
  const cityAvg = cityAvgCost(data.records);

  const items = data.records
    .filter((r) => r.status !== "resolved" && r.zone_id)
    .map((record) => {
      const zone = data.zones.find((z) => z.zoneId === record.zone_id)!;
      const waitingDays = asOf && record.date_submitted ? Math.max(0, Math.round((asOf - parse(record.date_submitted)) / DAY)) : null;
      const zoneRel = Math.max(0, Math.min(1, (zone.severityScore - domain[0]) / (domain[1] - domain[0] || 1)));
      const priorityPts = record.priority ? PRIORITY_POINTS[record.priority] : UNKNOWN_PRIORITY_POINTS;
      const agePts = waitingDays === null ? 0 : Math.min(waitingDays / 180, 1) * 30;
      const why: string[] = [];
      if (record.priority === "high") why.push("urgjente");
      if (waitingDays !== null && waitingDays >= 90) why.push(`${waitingDays} ditë në pritje`);
      if (zoneRel >= 0.67) why.push("zonë me rrezik të lartë");
      return {
        rank: 0,
        record,
        zoneId: zone.zoneId,
        zoneLabel: zone.zoneLabel,
        cost: record.cost_estimate_leke ?? Math.round(zone.avgCostLeke ?? cityAvg ?? FALLBACK_COST),
        estimated: record.cost_estimate_leke == null,
        waitingDays,
        urgency: priorityPts + agePts + zoneRel * 20,
        why,
      } satisfies PlanItem;
    })
    .sort(
      (a, b) =>
        Number(b.record.priority === "high") - Number(a.record.priority === "high") || b.urgency - a.urgency || a.cost - b.cost
    );

  items.forEach((it, i) => (it.rank = i + 1));
  return items;
}

/** The budget at which everything open would be funded -- the end of the slider. */
export function maxBudgetLeke(data: CommandCenterData): number {
  const total = rankRequests(data).reduce((a, it) => a + it.cost, 0);
  return Math.max(STEP_LEKE, Math.ceil(total / STEP_LEKE) * STEP_LEKE);
}

/** A first budget to show: about a sixth of everything open, so the plan is visibly partial. */
export function defaultBudgetLeke(data: CommandCenterData): number {
  const max = maxBudgetLeke(data);
  return Math.max(STEP_LEKE, Math.round(max / 6 / STEP_LEKE) * STEP_LEKE);
}

export function buildPlan(data: CommandCenterData, budgetLeke: number): Plan {
  const ranked = rankRequests(data);
  let left = budgetLeke;
  const funded: PlanItem[] = [];
  const unfunded: PlanItem[] = [];
  for (const it of ranked) {
    if (it.cost <= left) {
      left -= it.cost;
      funded.push(it);
    } else {
      unfunded.push(it);
    }
  }
  const fundedLeke = budgetLeke - left;

  const afterZones = data.zones.map((z): ZoneStats => {
    const mine = funded.filter((it) => it.zoneId === z.zoneId);
    if (mine.length === 0 || !z.budget) return z;
    const amount = mine.reduce((a, it) => a + it.cost, 0);
    const open = z.open - mine.filter((it) => it.record.status === "open").length;
    const inProgress = z.inProgress - mine.filter((it) => it.record.status === "in_progress").length;
    // The money is new to the zone and spent at once: it widens the budget and the spending equally.
    const allocated = z.budget.allocatedLeke + amount;
    const spent = z.budget.spentLeke + amount;
    const spentPct = Math.round((spent / allocated) * 100);
    return {
      ...z,
      open,
      inProgress,
      resolved: z.resolved + mine.length,
      budget: { ...z.budget, allocatedLeke: allocated, spentLeke: spent, spentPct },
      severityScore: scoreSeverity(open + inProgress, z.total, spentPct),
    };
  });

  const pending = (z: ZoneStats) => z.open + z.inProgress;
  const zones = data.zones
    .map((z, i): ZonePlan => {
      const after = afterZones[i];
      const mine = funded.filter((it) => it.zoneId === z.zoneId);
      return {
        zoneId: z.zoneId,
        zoneLabel: z.zoneLabel,
        amountLeke: mine.reduce((a, it) => a + it.cost, 0),
        requests: mine.length,
        pendingBefore: pending(z),
        pendingAfter: pending(after),
        riskBefore: z.severityScore,
        riskAfter: after.severityScore,
      };
    })
    .filter((z) => z.amountLeke > 0)
    .sort((a, b) => b.amountLeke - a.amountLeke);

  return {
    budgetLeke,
    fundedLeke,
    leftoverLeke: left,
    funded,
    unfunded,
    unfundedLeke: unfunded.reduce((a, it) => a + it.cost, 0),
    urgentNeedLeke: ranked.filter((it) => it.record.priority === "high").reduce((a, it) => a + it.cost, 0),
    zones,
    afterZones,
    cityPendingBefore: data.zones.reduce((a, z) => a + pending(z), 0),
    cityPendingAfter: afterZones.reduce((a, z) => a + pending(z), 0),
  };
}

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The plan as a spreadsheet: one row per funded request, in the order to do them. */
export function planToCsv(plan: Plan): string {
  const head = ["Nr.", "Zona", "ID", "Kategoria", "Përshkrimi", "Prioriteti", "Ditë në pritje", "Kosto (Lekë)", "Kosto e vlerësuar", "Burimi"];
  const rows = plan.funded.map((it, i) => [
    i + 1,
    zoneLabel(it.zoneId),
    it.record.request_id,
    it.record.category ? CATEGORY_LABEL[it.record.category] : "",
    it.record.description ?? "",
    it.record.priority ? PRIORITY_LABEL[it.record.priority] : "",
    it.waitingDays ?? "",
    it.cost,
    it.estimated ? "po (mesatare)" : "jo",
    it.record.source_system,
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csv).join(",")).join("\n");
}
