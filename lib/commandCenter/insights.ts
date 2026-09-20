import type { CanonicalRequest } from "@/lib/fusion/schema";
import type { CommandCenterData, TrendPoint, ZoneStats } from "./aggregate";
import { CATEGORY_LABEL, formatLeke } from "./labels";
import { monthName } from "./months";
import { severityDomain, severityLevel } from "./severityColor";

/**
 * Decision support, without a black box. Every sentence below is computed from the fused records
 * (counts, dates, budget rows) and comes with the numbers it was computed from (`facts`) and the
 * exact requests it points at (`action.evidenceKeys`), so an officer can check it in one click.
 * "Now" is the newest request in the data, not the wall clock: the demo data ends in June.
 */

/** Text with parts to emphasise: plain strings and `{ b }` bold parts. */
export type Seg = string | { b: string };

export interface Insight {
  zoneId: string;
  zoneLabel: string;
  level: string;
  score: number;
  headline: Seg[];
  action: { title: Seg[]; detail: string } | null;
  /** The audit trail behind the headline and the action. */
  facts: { label: string; value: string }[];
  basedOn: number;
  asOf: string;
}

const DAY = 86_400_000;
const parse = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const ACTION: Record<string, string> = {
  road: "riparimin e rrugëve",
  lighting: "riparimin e ndriçimit",
  water: "kontrollin e ujësjellësit",
  waste: "mbledhjen e mbeturinave",
  green: "mirëmbajtjen e gjelbërimit",
  other: "shqyrtimin e kërkesave të tjera",
};

export function topPriorityZone(zones: ZoneStats[]): ZoneStats | null {
  if (zones.length === 0) return null;
  return [...zones].sort((a, b) => b.severityScore - a.severityScore)[0];
}

export function latestDate(records: CanonicalRequest[]): string | null {
  let max: string | null = null;
  for (const r of records) if (r.date_submitted && (!max || r.date_submitted > max)) max = r.date_submitted;
  return max;
}

function formatDate(d: string): string {
  return `${+d.slice(8, 10)} ${monthName(d.slice(0, 7), true)}`;
}

/** Monthly request counts for one zone, on the same month axis as the city trend (zeros included). */
export function zoneTrend(records: CanonicalRequest[], months: TrendPoint[], zoneId: string): TrendPoint[] {
  return months.map(({ month }) => ({
    month,
    count: records.filter((r) => r.zone_id === zoneId && r.date_submitted?.startsWith(month)).length,
  }));
}

/** What an average zone looks like each month -- the yardstick a single zone is drawn against. */
export function averageZoneTrend(months: TrendPoint[], zoneCount: number): TrendPoint[] {
  return months.map((m) => ({ month: m.month, count: Math.round((m.count / Math.max(zoneCount, 1)) * 10) / 10 }));
}

type Candidate = { score: number; order: number; text: Seg[] };

export function buildInsight(data: CommandCenterData, zoneId: string): Insight | null {
  const zone = data.zones.find((z) => z.zoneId === zoneId);
  const asOfStr = latestDate(data.records);
  if (!zone || !asOfStr) return null;

  const asOf = parse(asOfStr);
  const mine = data.records.filter((r) => r.zone_id === zoneId);
  const unresolved = mine.filter((r) => r.status !== "resolved");
  const domain = severityDomain(data.zones.map((z) => z.severityScore));
  const facts: Insight["facts"] = [];
  // "në Zonën 3" -- Albanian wants the accusative after "në".
  const inZone = `në ${zone.zoneLabel.replace(/^Zona/, "Zonën")}`;
  const candidates: Candidate[] = [];

  // 1) Activity: last 90 days against the 90 before.
  const inWindow = (r: CanonicalRequest, from: number, to: number) => {
    if (!r.date_submitted) return false;
    const t = parse(r.date_submitted);
    return t > asOf - to * DAY && t <= asOf - from * DAY;
  };
  const recent = mine.filter((r) => inWindow(r, 0, 90)).length;
  const prior = mine.filter((r) => inWindow(r, 90, 180)).length;
  if (recent + prior > 0) {
    facts.push({ label: "Kërkesa në 90 ditët e fundit", value: `${recent} (më parë: ${prior})` });
    const pct = prior >= 3 ? ` (${recent > prior ? "+" : "−"}${Math.round((Math.abs(recent - prior) / prior) * 100)}%)` : "";
    if (recent >= 2 && recent > prior) {
      candidates.push({ score: 4, order: 0, text: [`Aktiviteti ${inZone} po rritet: `, { b: `${recent} kërkesa` }, ` në 90 ditët e fundit, nga ${prior} më parë${pct}.`] });
    } else if (prior >= 2 && recent < prior) {
      candidates.push({ score: 1, order: 0, text: [`Aktiviteti ${inZone} po ulet: `, { b: `${recent} kërkesa` }, ` në 90 ditët e fundit, nga ${prior}${pct}.`] });
    }
  }

  // 2) Budget spent faster than the year has passed.
  if (zone.budget) {
    const yearPct = Math.round(((asOf - Date.UTC(new Date(asOf).getUTCFullYear(), 0, 1)) / (365 * DAY)) * 100);
    const gap = zone.budget.spentPct - yearPct;
    facts.push({ label: "Buxheti i përdorur", value: `${zone.budget.spentPct}% (viti: ${yearPct}%)` });
    if (gap >= 12) {
      candidates.push({ score: gap >= 20 ? 4 : 3, order: 1, text: ["Buxheti po shpenzohet më shpejt se viti: ", { b: `${zone.budget.spentPct}%` }, ` e përdorur, kur viti ka kaluar ${yearPct}%.`] });
    }
  }

  // 3) One kind of problem dominating what is still open.
  const byCat = new Map<string, CanonicalRequest[]>();
  for (const r of unresolved) {
    const c = r.category ?? "other";
    byCat.set(c, [...(byCat.get(c) ?? []), r]);
  }
  const oldestOf = (rs: CanonicalRequest[]) => rs.map((r) => r.date_submitted).filter(Boolean).sort()[0] ?? null;
  const ranked = [...byCat.entries()].sort(
    (a, b) => b[1].length - a[1].length || (oldestOf(a[1]) ?? "9").localeCompare(oldestOf(b[1]) ?? "9")
  );
  if (ranked.length && unresolved.length >= 2) {
    const [cat, rs] = ranked[0];
    if (rs.length >= 2 && rs.length / unresolved.length >= 0.5) {
      candidates.push({ score: 3, order: 2, text: [{ b: `${rs.length} nga ${unresolved.length}` }, ` kërkesat e pazgjidhura janë për `, { b: CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat }, "."] });
    }
  }

  // 4) How long the oldest open request has been waiting.
  const oldest = oldestOf(unresolved);
  const oldestDays = oldest ? Math.round((asOf - parse(oldest)) / DAY) : null;
  facts.push({ label: "Të pazgjidhura", value: `${unresolved.length} nga ${mine.length}` });
  if (oldestDays !== null) {
    facts.push({ label: "Më e vjetra e pazgjidhur", value: `${oldestDays} ditë` });
    if (oldestDays >= 60) {
      candidates.push({ score: oldestDays >= 90 ? 3 : 2, order: 3, text: ["Kërkesa më e vjetër e pazgjidhur pret prej ", { b: `${oldestDays} ditësh` }, "."] });
    }
  }

  // Cost of what is open, where the sources gave an estimate.
  const costs = unresolved.map((r) => r.cost_estimate_leke).filter((c): c is number => c != null);
  const cost = costs.reduce((a, b) => a + b, 0);
  if (costs.length) {
    const remaining = zone.budget ? zone.budget.allocatedLeke - zone.budget.spentLeke : null;
    facts.push({ label: "Kosto e vlerësuar", value: `${formatLeke(cost)} · ${costs.length}/${unresolved.length} me vlerësim` });
    if (remaining && remaining > 0) facts.push({ label: "Kundrejt buxhetit të mbetur", value: `${Math.round((cost / remaining) * 100)}%` });
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const headline: Seg[] = candidates[0]?.text ?? (unresolved.length
    ? [`${zone.zoneLabel} nuk ka sinjale të forta: `, { b: `${unresolved.length} kërkesa` }, " të pazgjidhura."]
    : [`${zone.zoneLabel}: të gjitha kërkesat janë zgjidhur.`]);

  let action: Insight["action"] = null;
  if (ranked.length) {
    const [cat, rs] = ranked[0];
    const days = oldestOf(rs) ? Math.round((asOf - parse(oldestOf(rs)!)) / DAY) : null;
    action = {
      title: ["Prioritizo ", { b: ACTION[cat] ?? "kërkesat e hapura" }],
      detail: [
        rs.length === 1 ? "1 kërkesë e hapur" : `${rs.length} kërkesa të hapura`,
        days !== null ? `më e vjetra ${days} ditë` : null,
      ].filter(Boolean).join(" · "),
    };
  }

  return {
    zoneId,
    zoneLabel: zone.zoneLabel,
    level: severityLevel(zone.severityScore, domain),
    score: zone.severityScore,
    headline,
    action,
    facts,
    basedOn: mine.length,
    asOf: formatDate(asOfStr),
  };
}
