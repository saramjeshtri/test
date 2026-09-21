import type { CanonicalCategory, CanonicalPriority, CanonicalRequest, CanonicalStatus } from "@/lib/fusion/schema";
import type { ZoneStats } from "@/lib/commandCenter/aggregate";
import { averageZoneTrend, buildInsight, latestDate, zoneTrend, type Seg } from "@/lib/commandCenter/insights";
import { buildPlan } from "@/lib/commandCenter/plan";
import { CATEGORY_LABEL, PRIORITY_LABEL, SOURCE_SHORT, STATUS_LABEL, zoneLabel } from "@/lib/commandCenter/labels";
import { monthName } from "@/lib/commandCenter/months";
import { severityDomain, severityLevel } from "@/lib/commandCenter/severityColor";
import { semanticRank } from "./embeddings";
import { withTimeout } from "./time";
import { fold } from "./text";
import type { ParamSchema, ToolContext, ToolSpec } from "./types";

/**
 * The agent's hands. Every number and every fact in an answer must come out of one of these, so
 * they are read-only, small, and return the request handles (`ref`) that answers cite. They never
 * throw at the model: a bad argument comes back as `{ error, ... }` so it can correct itself.
 */

type Args = Record<string, unknown>;
type Out = Record<string, unknown>;

const MAX_LIMIT = 15;
/** A semantic hit counts when it scores at least this, and within this much of the best hit. */
const SEMANTIC_FLOOR = 0.5;
const SEMANTIC_BAND = 0.05;
/** Past this the search stops waiting for the embeddings and uses keywords (the embeddings finish in the background). */
const SEMANTIC_BUDGET_MS = 8_000;
const DEFAULT_LIMIT = 8;

/* ------------------------------ argument cleaning ------------------------------ */

const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function readZone(v: unknown, ctx: ToolContext): { zone?: string; error?: Out } {
  const raw = asString(v);
  if (!raw) return {};
  const n = raw.match(/(\d+)/)?.[1];
  const id = n ? `area-${Number(n)}` : undefined;
  if (id && ctx.data.zones.some((z) => z.zoneId === id)) return { zone: id };
  return { error: { error: `Unknown zone "${raw}"`, validZones: ctx.data.zones.map((z) => `${z.zoneId} (${z.zoneLabel})`) } };
}

type StatusFilter = CanonicalStatus | "unresolved";

function readStatus(v: unknown): { status?: StatusFilter; error?: Out } {
  const raw = asString(v);
  if (!raw) return {};
  const t = fold(raw);
  // "pazgjidhur" contains "zgjidhur", so the negative forms are tested first.
  if (t.includes("unresolved") || t.includes("pazgjidhur") || t.includes("pending")) return { status: "unresolved" };
  if (t.includes("resolved") || t.includes("zgjidhur") || t.includes("perfunduar")) return { status: "resolved" };
  if (t.includes("progress") || t.includes("proces") || t.includes("vazhdim")) return { status: "in_progress" };
  if (t.includes("open") || t.includes("pritje") || t.includes("hapur") || t.includes("filluar")) return { status: "open" };
  return { error: { error: `Unknown status "${raw}"`, validStatuses: ["open", "in_progress", "resolved", "unresolved"] } };
}

function readCategory(v: unknown): { category?: CanonicalCategory; error?: Out } {
  const raw = asString(v);
  if (!raw) return {};
  const t = fold(raw);
  const keys = Object.keys(CATEGORY_LABEL) as CanonicalCategory[];
  const hit = keys.find((k) => k === t || fold(CATEGORY_LABEL[k]) === t || fold(CATEGORY_LABEL[k]).includes(t));
  return hit ? { category: hit } : { error: { error: `Unknown category "${raw}"`, validCategories: keys } };
}

function readPriority(v: unknown): { priority?: CanonicalPriority; error?: Out } {
  const raw = asString(v);
  if (!raw) return {};
  const t = fold(raw);
  if (t === "high" || t.includes("urgjent") || t.includes("lart")) return { priority: "high" };
  if (t === "medium" || t.includes("mesatar")) return { priority: "medium" };
  if (t === "low" || t.includes("normal") || t.includes("ulet")) return { priority: "low" };
  return { error: { error: `Unknown priority "${raw}"`, validPriorities: ["high", "medium", "low"] } };
}

function readMonth(v: unknown): { month?: string; error?: Out } {
  const raw = asString(v);
  if (!raw) return {};
  return /^\d{4}-\d{2}$/.test(raw) ? { month: raw } : { error: { error: `Month must look like 2026-03, got "${raw}"` } };
}

interface Filters {
  zone?: string;
  status?: StatusFilter;
  category?: CanonicalCategory;
  priority?: CanonicalPriority;
  month?: string;
}

/** Reads the shared filter arguments; the first bad one comes back as `error`. */
function readFilters(args: Args, ctx: ToolContext): { filters: Filters; error?: Out } {
  const parts = [readZone(args.zone, ctx), readStatus(args.status), readCategory(args.category), readPriority(args.priority), readMonth(args.month)];
  const error = parts.find((p) => p.error)?.error;
  return {
    filters: {
      zone: (parts[0] as { zone?: string }).zone,
      status: (parts[1] as { status?: StatusFilter }).status,
      category: (parts[2] as { category?: CanonicalCategory }).category,
      priority: (parts[3] as { priority?: CanonicalPriority }).priority,
      month: (parts[4] as { month?: string }).month,
    },
    error,
  };
}

function applyFilters(records: CanonicalRequest[], f: Filters): CanonicalRequest[] {
  return records.filter(
    (r) =>
      (!f.zone || r.zone_id === f.zone) &&
      (!f.status || (f.status === "unresolved" ? r.status !== "resolved" : r.status === f.status)) &&
      (!f.category || r.category === f.category) &&
      (!f.priority || r.priority === f.priority) &&
      (!f.month || r.date_submitted?.startsWith(f.month))
  );
}

function describeFilters(f: Filters): Out {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
}

/* ------------------------------ shared pieces ------------------------------ */

const segText = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.b)).join("");
const pending = (z: ZoneStats) => z.open + z.inProgress;
const oldestFirst = (a: CanonicalRequest, b: CanonicalRequest) => (a.date_submitted ?? "9").localeCompare(b.date_submitted ?? "9");

function zoneRows(ctx: ToolContext) {
  const domain = severityDomain(ctx.data.zones.map((z) => z.severityScore));
  return [...ctx.data.zones]
    .sort((a, b) => b.severityScore - a.severityScore)
    .map((z) => ({
      zone: z.zoneId,
      label: z.zoneLabel,
      priorityLevel: severityLevel(z.severityScore, domain),
      riskScore: z.severityScore,
      unresolved: pending(z),
      total: z.total,
    }));
}

const ZONE_PARAM: ParamSchema = { type: "string", description: 'Zone, e.g. "area-3" or "Zona 3" (zones are area-1 to area-6).' };
const STATUS_PARAM: ParamSchema = {
  type: "string",
  description: "Request status. 'unresolved' means open or in progress.",
  enum: ["open", "in_progress", "resolved", "unresolved"],
};
const CATEGORY_PARAM: ParamSchema = { type: "string", description: "Request category.", enum: Object.keys(CATEGORY_LABEL) };
const PRIORITY_PARAM: ParamSchema = { type: "string", description: "Request priority.", enum: ["high", "medium", "low"] };
const MONTH_PARAM: ParamSchema = { type: "string", description: "Month the request was submitted, as YYYY-MM, e.g. 2026-03." };

/* ------------------------------ the tools ------------------------------ */

const cityOverview: ToolSpec = {
  name: "city_overview",
  description:
    "City-wide picture: total requests, how many are resolved / in progress / open, and every zone ranked by how much attention it needs. Use for questions about the whole city or about which zone needs attention most.",
  parameters: { type: "object", properties: {} },
  run(_args, ctx) {
    const { records, zones } = ctx.data;
    const count = (s: CanonicalStatus) => records.filter((r) => r.status === s).length;
    const resolved = count("resolved");
    return {
      asOf: latestDate(records),
      totalRequests: records.length,
      byStatus: { resolved, in_progress: count("in_progress"), open: count("open") },
      unresolved: records.length - resolved,
      resolvedPercent: records.length ? Math.round((resolved / records.length) * 100) : 0,
      zonesByPriority: zoneRows(ctx),
      zoneCount: zones.length,
      note: "riskScore is 0-100: 60% the share of the zone's requests still open, 40% the share of its budget already spent. priorityLevel is relative to the other zones.",
    };
  },
  summarize: (o) => `${(o as Out).totalRequests} kërkesa, ${(o as Out).unresolved} të pazgjidhura`,
};

const zoneSummary: ToolSpec = {
  name: "zone_summary",
  description:
    "Detailed picture of ONE zone: request counts, budget, its risk level, an automatic insight with a recommended action, the unresolved requests by category, and the oldest unresolved requests (with refs to cite).",
  parameters: { type: "object", properties: { zone: ZONE_PARAM }, required: ["zone"] },
  run(args, ctx) {
    const z = readZone(args.zone, ctx);
    if (z.error) return z.error;
    if (!z.zone) return { error: "zone is required", validZones: ctx.data.zones.map((x) => x.zoneId) };
    const stats = ctx.data.zones.find((x) => x.zoneId === z.zone)!;
    const insight = buildInsight(ctx.data, z.zone);
    const domain = severityDomain(ctx.data.zones.map((x) => x.severityScore));
    const open = ctx.data.records.filter((r) => r.zone_id === z.zone && r.status !== "resolved").sort(oldestFirst);
    const byCategory: Record<string, number> = {};
    for (const r of open) {
      const label = r.category ? CATEGORY_LABEL[r.category] : "Pa kategori";
      byCategory[label] = (byCategory[label] ?? 0) + 1;
    }
    return {
      zone: stats.zoneId,
      label: stats.zoneLabel,
      priorityLevel: severityLevel(stats.severityScore, domain),
      riskScore: stats.severityScore,
      total: stats.total,
      resolved: stats.resolved,
      inProgress: stats.inProgress,
      open: stats.open,
      unresolved: pending(stats),
      budget: stats.budget && {
        allocatedLeke: stats.budget.allocatedLeke,
        spentLeke: stats.budget.spentLeke,
        spentPercent: stats.budget.spentPct,
        remainingLeke: stats.budget.allocatedLeke - stats.budget.spentLeke,
        population: stats.budget.population,
      },
      insight: insight && {
        headline: segText(insight.headline),
        recommendation: insight.action && `${segText(insight.action.title)} (${insight.action.detail})`,
        evidence: insight.facts,
        asOf: insight.asOf,
      },
      unresolvedByCategory: byCategory,
      oldestUnresolved: open.slice(0, 4).map((r) => ctx.refs.view(r)),
    };
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${(o as Out).label}: ${(o as Out).unresolved} të pazgjidhura nga ${(o as Out).total}`),
};

const countRequests: ToolSpec = {
  name: "count_requests",
  description:
    "Count requests, optionally filtered and optionally grouped. ALWAYS use this for 'how many' questions instead of counting yourself. Returns the total and, with group_by, a breakdown.",
  parameters: {
    type: "object",
    properties: {
      zone: ZONE_PARAM,
      status: STATUS_PARAM,
      category: CATEGORY_PARAM,
      priority: PRIORITY_PARAM,
      month: MONTH_PARAM,
      group_by: {
        type: "string",
        description: "Break the count down by this field. Omit for a single total.",
        enum: ["zone", "status", "category", "priority", "month", "source"],
      },
    },
  },
  run(args, ctx) {
    const { filters, error } = readFilters(args, ctx);
    if (error) return error;
    const matching = applyFilters(ctx.data.records, filters);
    const groupBy = asString(args.group_by);
    const out: Out = { total: matching.length, ofAllRequests: ctx.data.records.length, filters: describeFilters(filters) };
    if (groupBy) {
      const key = (r: CanonicalRequest): { key: string; label: string } => {
        switch (groupBy) {
          case "zone": return { key: r.zone_id ?? "none", label: zoneLabel(r.zone_id) };
          case "status": return { key: r.status ?? "none", label: r.status ? STATUS_LABEL[r.status] : "Pa status" };
          case "category": return { key: r.category ?? "none", label: r.category ? CATEGORY_LABEL[r.category] : "Pa kategori" };
          case "priority": return { key: r.priority ?? "none", label: r.priority ? PRIORITY_LABEL[r.priority] : "Pa prioritet (burimi nuk e ndjek)" };
          case "month": return { key: r.date_submitted?.slice(0, 7) ?? "none", label: r.date_submitted ? monthName(r.date_submitted.slice(0, 7), true) : "Pa datë" };
          case "source": return { key: r.source_system, label: SOURCE_SHORT[r.source_system] ?? r.source_system };
          default: return { key: "all", label: "Të gjitha" };
        }
      };
      const groups = new Map<string, { label: string; count: number }>();
      for (const r of matching) {
        const k = key(r);
        groups.set(k.key, { label: k.label, count: (groups.get(k.key)?.count ?? 0) + 1 });
      }
      out.groupBy = groupBy;
      out.groups = [...groups.entries()].map(([k, g]) => ({ key: k, label: g.label, count: g.count })).sort((a, b) => b.count - a.count);
    }
    return out;
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${(o as Out).total} nga ${(o as Out).ofAllRequests}`),
};

/** Words of the search text that are long enough to mean something. */
const searchTerms = (text: string) => fold(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
/** The text of a request that is embedded and searched: where, what kind, and what it says. Never the name. */
export const requestDocText = (r: CanonicalRequest) => `${zoneLabel(r.zone_id)}. ${r.category ? CATEGORY_LABEL[r.category] : ""}. ${r.description ?? ""}`;

const searchRequests: ToolSpec = {
  name: "search_requests",
  description:
    "Find individual requests. Filter by zone / status / category / priority / month, and optionally give `text` to search descriptions BY MEANING (works across Albanian and English, e.g. 'zhurmë' also finds 'noise'). Returns requests with `ref` handles to cite. Use for 'show me', 'are there complaints about ...' and to get evidence. Do NOT use it to count: use count_requests.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What the requests are about, in a few words. Optional." },
      zone: ZONE_PARAM,
      status: STATUS_PARAM,
      category: CATEGORY_PARAM,
      priority: PRIORITY_PARAM,
      month: MONTH_PARAM,
      limit: { type: "integer", description: `How many to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
    },
  },
  async run(args, ctx) {
    const { filters, error } = readFilters(args, ctx);
    if (error) return error;
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.round(Number(args.limit)) || DEFAULT_LIMIT));
    const candidates = applyFilters(ctx.data.records, filters);
    const text = asString(args.text);

    if (!text) {
      const sorted = [...candidates].sort((a, b) => (b.date_submitted ?? "").localeCompare(a.date_submitted ?? ""));
      return { method: "filters", totalMatches: candidates.length, shown: Math.min(limit, sorted.length), filters: describeFilters(filters), requests: sorted.slice(0, limit).map((r) => ctx.refs.view(r)) };
    }

    // Meaning first, when an embeddings provider is configured; keywords if that is missing or fails.
    if (ctx.embed && candidates.length > 0) {
      try {
        const ranked = await withTimeout(
          semanticRank(ctx.embed, text, candidates.map((r) => ({ item: r, text: requestDocText(r) })), candidates.length),
          SEMANTIC_BUDGET_MS,
          "Semantic search"
        );
        // Similarity always ranks everything, so "found" needs a cutoff: only what scores close to the best
        // hit counts as a match (with real embeddings the relevant ones cluster, then the scores drop off).
        const best = ranked[0]?.score ?? 0;
        const relevant = ranked.filter((h) => h.score >= SEMANTIC_FLOOR && h.score >= best - SEMANTIC_BAND);
        return {
          method: "semantic",
          totalMatches: relevant.length,
          shown: Math.min(limit, relevant.length),
          searched: candidates.length,
          filters: describeFilters(filters),
          note: "Found by similarity of meaning, across Albanian and English. totalMatches counts only the requests that really match; searched is how many were looked through. Statuses vary: report them exactly as given.",
          requests: relevant.slice(0, limit).map((h) => ({ ...ctx.refs.view(h.item), similarity: Math.round(h.score * 100) / 100 })),
        };
      } catch {
        // fall through to keywords
      }
    }
    const terms = searchTerms(text);
    const scored = candidates
      .map((r) => ({ r, hits: terms.filter((t) => fold(requestDocText(r)).includes(t)).length }))
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits || oldestFirst(b.r, a.r));
    return {
      method: "keywords",
      totalMatches: scored.length,
      shown: Math.min(limit, scored.length),
      filters: describeFilters(filters),
      note: ctx.embed ? "Semantic search was unavailable, so this used keyword matching only." : "Keyword matching only (no embeddings provider configured): different words for the same thing will be missed.",
      requests: scored.slice(0, limit).map((s) => ctx.refs.view(s.r)),
    };
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${(o as Out).totalMatches} përputhje, ${(o as Out).shown} të treguara (${(o as Out).method})`),
};

const monthlyTrend: ToolSpec = {
  name: "monthly_trend",
  description: "Number of new requests per month, for the whole city or one zone (with the average zone for comparison).",
  parameters: { type: "object", properties: { zone: ZONE_PARAM } },
  run(args, ctx) {
    const z = readZone(args.zone, ctx);
    if (z.error) return z.error;
    const months = z.zone ? zoneTrend(ctx.data.records, ctx.data.trend, z.zone) : ctx.data.trend;
    const average = z.zone ? averageZoneTrend(ctx.data.trend, ctx.data.zones.length) : null;
    return {
      scope: z.zone ? zoneLabel(z.zone) : "Të gjitha zonat",
      months: months.map((m, i) => ({
        month: m.month,
        label: monthName(m.month, true),
        requests: m.count,
        ...(average ? { averageZone: average[i].count } : {}),
      })),
      note: "The newest month may be incomplete: the data ends on the date given by city_overview.asOf.",
    };
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${((o as Out).months as unknown[]).length} muaj`),
};

const budgetStatus: ToolSpec = {
  name: "budget_status",
  description: "Annual budget, amount spent so far and what remains, for every zone or one zone.",
  parameters: { type: "object", properties: { zone: ZONE_PARAM } },
  run(args, ctx) {
    const z = readZone(args.zone, ctx);
    if (z.error) return z.error;
    const rows = ctx.data.zones
      .filter((x) => (!z.zone || x.zoneId === z.zone) && x.budget)
      .map((x) => ({
        zone: x.zoneId,
        label: x.zoneLabel,
        allocatedLeke: x.budget!.allocatedLeke,
        spentLeke: x.budget!.spentLeke,
        spentPercent: x.budget!.spentPct,
        remainingLeke: x.budget!.allocatedLeke - x.budget!.spentLeke,
        population: x.budget!.population,
      }));
    return {
      asOf: latestDate(ctx.data.records),
      zones: rows,
      totals: {
        allocatedLeke: rows.reduce((a, r) => a + r.allocatedLeke, 0),
        spentLeke: rows.reduce((a, r) => a + r.spentLeke, 0),
        remainingLeke: rows.reduce((a, r) => a + r.remainingLeke, 0),
      },
    };
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${((o as Out).zones as unknown[]).length} zona`),
};

const buildWorkPlan: ToolSpec = {
  name: "build_work_plan",
  description:
    "Work plan for a monthly budget in Lekë: which open requests to fix first (urgent first, then by priority, waiting time and zone pressure), how much each zone needs, and what stays unfunded. Use for 'what should we fix first' and 'what if we have X Lekë'.",
  parameters: {
    type: "object",
    properties: { budget_leke: { type: "number", description: "The budget in Lekë, e.g. 1500000 for 1.5 million." } },
    required: ["budget_leke"],
  },
  run(args, ctx) {
    const budget = Math.round(Number(args.budget_leke));
    if (!Number.isFinite(budget) || budget <= 0) return { error: "budget_leke must be a positive number of Lekë, e.g. 1500000" };
    const plan = buildPlan(ctx.data, budget);
    return {
      budgetLeke: plan.budgetLeke,
      fundedRequests: plan.funded.length,
      fundedLeke: plan.fundedLeke,
      leftoverLeke: plan.leftoverLeke,
      unfundedRequests: plan.unfunded.length,
      unfundedLeke: plan.unfundedLeke,
      urgentNeedLeke: plan.urgentNeedLeke,
      cityUnresolved: { before: plan.cityPendingBefore, after: plan.cityPendingAfter },
      perZone: plan.zones.map((z) => ({ zone: z.zoneId, label: z.zoneLabel, amountLeke: z.amountLeke, requests: z.requests, riskBefore: z.riskBefore, riskAfter: z.riskAfter })),
      workOrder: plan.funded.slice(0, 8).map((it, i) => ({
        order: i + 1,
        ...ctx.refs.view(it.record),
        costLeke: it.cost,
        costIsEstimate: it.estimated,
        reasons: it.why,
      })),
      note: "A simple proposal, not a decision. Costs marked costIsEstimate use the zone average because the source gave none.",
    };
  },
  summarize: (o) => ((o as Out).error ? String((o as Out).error) : `${(o as Out).fundedRequests} kërkesa financohen`),
};

export const TOOLS: ToolSpec[] = [cityOverview, zoneSummary, countRequests, searchRequests, monthlyTrend, budgetStatus, buildWorkPlan];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
