import { CATEGORY_LABEL, STATUS_LABEL, formatLeke } from "@/lib/commandCenter/labels";
import { fold } from "./text";
import type { LanguageModel, Message, ModelStep, ToolCall } from "./types";

/**
 * A stand-in for the language model that needs no key and no network. It reads the question with
 * plain rules (keywords, numbers, zone names), picks tools, and writes the answer from a template.
 * It goes through the SAME agent loop and the SAME tools as Gemini, so every number and citation is
 * as real -- it just can't understand free-form language, and the interface says so.
 * Used when there is no GEMINI_API_KEY, and as the fallback when Gemini is unreachable.
 */

/* ---- the shapes of the tool outputs this file reads (see tools.ts) ---- */
interface ZoneRow { zone: string; label: string; priorityLevel: string; riskScore: number; unresolved: number; total: number }
interface OverviewOut { asOf: string | null; totalRequests: number; unresolved: number; resolvedPercent: number; byStatus: { resolved: number; in_progress: number; open: number }; zonesByPriority: ZoneRow[] }
interface RecordOut { ref: string; zone: string | null; category: string | null; description: string | null; status: string | null; date: string | null; costLeke: number | null; costIsEstimate?: boolean }
interface ZoneOut { label: string; priorityLevel: string; riskScore: number; total: number; unresolved: number; budget: { spentPercent: number; remainingLeke: number } | null; insight: { headline: string; recommendation: string | null; asOf: string } | null; unresolvedByCategory: Record<string, number>; oldestUnresolved: RecordOut[] }
interface CountOut { total: number; ofAllRequests: number; groupBy?: string; groups?: { label: string; count: number }[]; error?: string }
interface SearchOut { method: string; totalMatches: number; requests: RecordOut[]; error?: string }
interface TrendOut { scope: string; months: { label: string; requests: number }[] }
interface BudgetOut { zones: { label: string; spentPercent: number; remainingLeke: number }[]; totals: { allocatedLeke: number; spentLeke: number; remainingLeke: number } }
interface PlanOut { budgetLeke: number; fundedRequests: number; fundedLeke: number; unfundedRequests: number; urgentNeedLeke: number; cityUnresolved: { before: number; after: number }; perZone: { label: string; amountLeke: number; requests: number; riskBefore: number; riskAfter: number }[]; workOrder: (RecordOut & { order: number; reasons: string[] })[]; error?: string }

/* ------------------------------ reading the question ------------------------------ */

interface Intent {
  kind: "plan" | "trend" | "budget" | "priority" | "zone" | "count" | "search" | "greeting" | "help";
  zone?: string;
  status?: string;
  category?: string;
  budgetLeke?: number;
  groupBy?: string;
  text: string;
}

const CATEGORY_WORDS: [string, string][] = [
  ["rrug", "road"], ["asfalt", "road"], ["gropa", "road"],
  ["ndricim", "lighting"], ["drite", "lighting"], ["llamb", "lighting"], ["lamp", "lighting"], ["light", "lighting"],
  ["uje", "water"], ["kanaliz", "water"], ["water", "water"], ["sewage", "water"],
  ["mbetur", "waste"], ["plehr", "waste"], ["kontejner", "waste"], ["waste", "waste"],
  ["gjelber", "green"], ["park", "green"], ["pemet", "green"], ["green", "green"],
];

/** "1.5 mln", "500 mije", "800000 lek" -> Lekë. */
function readBudget(t: string): number | undefined {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mln|milion|million|mije|k\b|lek|l\b)?/);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  const unit = m[2] ?? "";
  const factor = /^(mln|milion|million)/.test(unit) ? 1_000_000 : /^(mije|k)/.test(unit) ? 1_000 : 1;
  const value = Math.round(n * factor);
  // A bare small number ("Zona 3") is not money.
  return unit || value >= 10_000 ? value : undefined;
}

export function parseIntent(question: string): Intent {
  const t = fold(question);
  const zoneNo = t.match(/(?:zon\w*|area)\s*[-nr.]*\s*(\d)/)?.[1];
  const zone = zoneNo ? `area-${zoneNo}` : undefined;
  const status = /pazgjidhur|pending/.test(t) ? "unresolved" : /zgjidhur|perfunduar|resolved/.test(t) ? "resolved" : /proces/.test(t) ? "in_progress" : /pritje|hapur|filluar/.test(t) ? "open" : undefined;
  const category = CATEGORY_WORDS.find(([w]) => t.includes(w))?.[1];
  const budgetLeke = readBudget(t.replace(/zon\w*\s*[-nr.]*\s*\d/g, ""));
  const groupBy = /sipas zon|per cdo zon|per secil.*zon|ne cdo zon|cdo zon/.test(t) ? "zone" : /sipas status|sipas gjendj/.test(t) ? "status" : /sipas kategori/.test(t) ? "category" : /sipas muaj|cdo muaj|per cdo muaj/.test(t) ? "month" : undefined;
  const base = { zone, status, category, budgetLeke, groupBy, text: question };

  if (/^\s*(pershendetje|tungjatjeta|miredita|mirmengjes|mbremje|c'?kemi|hello|hi|hej)\b/.test(t)) return { kind: "greeting", ...base };

  if (/plan|rregull|prioritiz|fillojme|financo/.test(t) && (budgetLeke || /plan/.test(t))) return { kind: "plan", ...base };
  if (/trend|muaj|ndryshim|si ka ecur|rritje|renie|evolu/.test(t) && (!groupBy || groupBy === "month")) return { kind: "trend", ...base };
  if (/buxhet|shpenz|\bpara\b|\blek/.test(t)) return { kind: "budget", ...base };
  if (/vemendje|prioritet|rrezik|urgjent|me keq|kritik|problematik|me shume ka nevoje/.test(t)) return zone ? { kind: "zone", ...base } : { kind: "priority", ...base };
  if (/\bsa\b|numri|numero|sasia|totali?\b/.test(t)) return { kind: "count", ...base };
  if (/kerko|ankes|shfaq|trego|lista|ka .*(per|mbi)|problem|kerkes/.test(t) || category) return { kind: "search", ...base };
  if (zone) return { kind: "zone", ...base };
  return { kind: "help", ...base };
}

/** The question without the words that only say "search". */
function searchText(q: string): string {
  return fold(q)
    .replace(/[?!.,]/g, " ")
    .replace(/\b(ka|a|ka ndonje|ndonje|ankesa|ankese|kerkesa|kerkese|per|mbi|shfaq|trego|me|te|e|ne|nga|zon\w*|\d+|lista|kerko)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------ choosing tools ------------------------------ */

function planCalls(intent: Intent, doneTools: Set<string>, overview: OverviewOut | undefined): ToolCall[] {
  const { kind } = intent;
  if (kind === "plan") return doneTools.has("build_work_plan") ? [] : [{ name: "build_work_plan", args: { budget_leke: intent.budgetLeke ?? 1_000_000 } }];
  if (kind === "trend") return doneTools.has("monthly_trend") ? [] : [{ name: "monthly_trend", args: intent.zone ? { zone: intent.zone } : {} }];
  if (kind === "budget") return doneTools.has("budget_status") ? [] : [{ name: "budget_status", args: intent.zone ? { zone: intent.zone } : {} }];
  if (kind === "zone") return doneTools.has("zone_summary") ? [] : [{ name: "zone_summary", args: { zone: intent.zone } }];
  if (kind === "priority") {
    if (!doneTools.has("city_overview")) return [{ name: "city_overview", args: {} }];
    const top = overview?.zonesByPriority[0];
    return top && !doneTools.has("zone_summary") ? [{ name: "zone_summary", args: { zone: top.zone } }] : [];
  }
  if (kind === "count") {
    if (doneTools.has("count_requests")) return [];
    const args: Record<string, unknown> = {};
    if (intent.zone) args.zone = intent.zone;
    if (intent.status) args.status = intent.status;
    if (intent.category) args.category = intent.category;
    if (intent.groupBy) args.group_by = intent.groupBy;
    return [{ name: "count_requests", args }];
  }
  if (kind === "search") {
    if (doneTools.has("search_requests")) return [];
    const args: Record<string, unknown> = { limit: 6 };
    const text = searchText(intent.text);
    if (text && !intent.category) args.text = text;
    if (intent.zone) args.zone = intent.zone;
    if (intent.status) args.status = intent.status;
    if (intent.category) args.category = intent.category;
    return [{ name: "search_requests", args }];
  }
  return [];
}

/* ------------------------------ writing the answer ------------------------------ */

const rec = (r: RecordOut) => `${r.zone ?? "—"} · ${r.category ?? "Kërkesë"}: ${r.description ?? "pa përshkrim"}${r.status ? ` (${r.status.toLowerCase()}` + (r.date ? `, ${r.date}` : "") + ")" : ""} [${r.ref}]`;

function describeFilters(i: Intent, zoneLabelText: string | undefined): string {
  const parts: string[] = [];
  parts.push(i.status === "unresolved" ? "të pazgjidhura" : i.status ? `me statusin "${STATUS_LABEL[i.status as keyof typeof STATUS_LABEL].toLowerCase()}"` : "");
  if (i.category) parts.push(`për ${CATEGORY_LABEL[i.category as keyof typeof CATEGORY_LABEL].toLowerCase()}`);
  if (zoneLabelText) parts.push(`në ${zoneLabelText.replace(/^Zona/, "Zonën")}`);
  return parts.filter(Boolean).join(" ");
}

function compose(intent: Intent, out: Record<string, unknown>): string {
  const overview = out.city_overview as OverviewOut | undefined;
  const zone = out.zone_summary as ZoneOut | undefined;

  if (intent.kind === "priority" || intent.kind === "zone") {
    if (!zone) return "Nuk arrita të marr të dhënat e zonës.";
    const lines = [
      `**${zone.label}** ${intent.kind === "priority" ? "kërkon më shumë vëmendje tani" : "sipas të dhënave"}: ${zone.priorityLevel.toLowerCase()}, rrezik ${zone.riskScore}/100, ${zone.unresolved} kërkesa të pazgjidhura nga ${zone.total}.`,
    ];
    if (zone.insight) lines.push(zone.insight.headline);
    if (zone.insight?.recommendation) lines.push(`Rekomandim: ${zone.insight.recommendation}.`);
    const oldest = zone.oldestUnresolved[0];
    if (oldest) lines.push(`Më e vjetra e pazgjidhur: ${oldest.category ?? "kërkesë"} — ${oldest.description ?? "pa përshkrim"} (${oldest.date ?? "pa datë"}) [${oldest.ref}].`);
    if (intent.kind === "priority" && overview) {
      lines.push(`Renditja e zonave: ${overview.zonesByPriority.map((z) => `${z.label} (${z.riskScore})`).join(", ")}.`);
    }
    return lines.join("\n\n") + (zone.insight ? `\n\nTë dhëna deri më ${zone.insight.asOf}.` : "");
  }

  if (intent.kind === "count") {
    const c = out.count_requests as CountOut | undefined;
    if (!c) return "Nuk arrita të numëroj kërkesat.";
    if (c.error) return `Nuk e kuptova filtrin: ${c.error}.`;
    const label = describeFilters(intent, intent.zone ? `Zona ${intent.zone.replace("area-", "")}` : undefined);
    const head = `Ka **${c.total}** kërkesa${label ? " " + label : ""}, nga ${c.ofAllRequests} gjithsej.`;
    if (c.groups && c.groups.length > 0) return `${head}\n\n${c.groups.slice(0, 8).map((g) => `- ${g.label}: ${g.count}`).join("\n")}`;
    return head;
  }

  if (intent.kind === "search") {
    const s = out.search_requests as SearchOut | undefined;
    if (!s) return "Nuk arrita të kërkoj.";
    if (s.error) return `Nuk e kuptova filtrin: ${s.error}.`;
    if (s.requests.length === 0) return "Nuk gjeta kërkesa që përputhen. Provo fjalë të tjera ose një filtër tjetër.";
    const note = s.method === "keywords" ? " Kërkimi është me fjalë kyçe (pa model)." : "";
    return `Gjeta **${s.totalMatches}** kërkesa; po tregoj ${s.requests.length}:${note}\n\n${s.requests.map((r) => `- ${rec(r)}`).join("\n")}`;
  }

  if (intent.kind === "trend") {
    const tr = out.monthly_trend as TrendOut | undefined;
    if (!tr) return "Nuk arrita të marr trendin.";
    const peak = tr.months.reduce((a, b) => (b.requests > a.requests ? b : a), tr.months[0]);
    return `Kërkesat e reja sipas muajit (${tr.scope}):\n\n${tr.months.map((m) => `- ${m.label}: ${m.requests}`).join("\n")}\n\nMuaji me më shumë aktivitet: **${peak.label}** (${peak.requests}).`;
  }

  if (intent.kind === "budget") {
    const b = out.budget_status as BudgetOut | undefined;
    if (!b) return "Nuk arrita të marr buxhetin.";
    const rows = b.zones.map((z) => `- ${z.label}: ${z.spentPercent}% e shpenzuar, mbeten ${formatLeke(z.remainingLeke)}`).join("\n");
    return `${rows}\n\nGjithsej: shpenzuar ${formatLeke(b.totals.spentLeke)} nga ${formatLeke(b.totals.allocatedLeke)}; mbeten ${formatLeke(b.totals.remainingLeke)}.`;
  }

  if (intent.kind === "plan") {
    const p = out.build_work_plan as PlanOut | undefined;
    if (!p) return "Nuk arrita të ndërtoj planin.";
    if (p.error) return `Nuk e kuptova buxhetin: ${p.error}.`;
    const assumed = intent.budgetLeke ? "" : " (nuk përmende shumën; supozova 1 mln L)";
    const zones = p.perZone.map((z) => `- ${z.label}: ${formatLeke(z.amountLeke)} për ${z.requests} ${z.requests === 1 ? "kërkesë" : "kërkesa"}, rreziku ${z.riskBefore}→${z.riskAfter}`).join("\n");
    const first = p.workOrder.slice(0, 3).map((r) => `${r.order}. ${r.zone} · ${r.category ?? "Kërkesë"}: ${r.description ?? "pa përshkrim"} (${r.reasons.join(", ") || "sipas radhës"}) [${r.ref}]`).join("\n");
    return `Me ${formatLeke(p.budgetLeke)}${assumed} financohen **${p.fundedRequests} kërkesa** (${formatLeke(p.fundedLeke)}); ${p.unfundedRequests} mbeten pa buxhet. Të pazgjidhurat e qytetit bien nga ${p.cityUnresolved.before} në ${p.cityUnresolved.after}.\n\n${zones}\n\nRadha e parë e punës:\n${first}\n\nÇdo kosto ku burimi nuk ka vlerësim është mesatarja e zonës. Është një propozim për diskutim, jo vendim.`;
  }

  return "";
}

const EXAMPLES =
  "- Cila zonë kërkon më shumë vëmendje?\n- Sa kërkesa të pazgjidhura ka Zona 3?\n- Si ka ecur numri i kërkesave çdo muaj?\n- Sa buxhet ka mbetur në Zona 5?\n- Nëse kemi 1.5 mln L, çfarë të rregullojmë së pari?\n- Trego ankesat për mbeturina.";

/** Not something the rules understand: say so and what would fix it, instead of guessing. */
const NEEDS_MODEL = `Kjo pyetje kërkon modelin gjuhësor (Gemini). Pa të mund të përgjigjem vetëm për të dhënat e bashkisë. Shto GEMINI_API_KEY në .env.local dhe rinis serverin, pastaj mund të pyesësh për çdo gjë rreth Elbasanit.\n\nNdërkohë provo:\n\n${EXAMPLES}`;

const NEEDS_MODEL_FOR_PHOTOS = `Për të parë foton duhet modeli gjuhësor (Gemini). Shto GEMINI_API_KEY në .env.local dhe rinis serverin. Ndërkohë shkruaj çfarë problemi tregon fotoja, për shembull "ndriçim publik" ose "gropë në rrugë", dhe kërkoj kërkesa të ngjashme në të dhëna.`;

const GREETING = `Përshëndetje! Jam Busulla, asistenti i qytetit të Elbasanit. Mund të më pyesësh për kërkesat, zonat dhe buxhetin. Provo:\n\n${EXAMPLES}`;

/* ------------------------------ the model ------------------------------ */

function lastUserHasPhotos(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return (m.images?.length ?? 0) > 0;
  }
  return false;
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return m.text;
  }
  return "";
}

/** Every tool output seen so far in this run (later ones win). */
function collectResults(messages: Message[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let sawUser = false;
  // Only this run's tool results: stop at the newest user message.
  for (let i = messages.length - 1; i >= 0 && !sawUser; i--) {
    const m = messages[i];
    if (m.role === "user") sawUser = true;
    if (m.role === "tool") for (const r of m.results) if (!(r.name in out)) out[r.name] = r.output;
  }
  return out;
}

export const offlineModel: LanguageModel = {
  kind: "offline",
  label: "pa model (rregulla)",
  async step(_system, messages): Promise<ModelStep> {
    if (lastUserHasPhotos(messages)) return { text: NEEDS_MODEL_FOR_PHOTOS, toolCalls: [] };
    const intent = parseIntent(lastUserText(messages));
    if (intent.kind === "greeting") return { text: GREETING, toolCalls: [] };
    if (intent.kind === "help") return { text: NEEDS_MODEL, toolCalls: [] };

    const results = collectResults(messages);
    const calls = planCalls(intent, new Set(Object.keys(results)), results.city_overview as OverviewOut | undefined);
    if (calls.length > 0) return { text: "", toolCalls: calls };
    return { text: compose(intent, results), toolCalls: [] };
  },
};
