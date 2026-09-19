import { STATUS_ALIASES, CATEGORY_ALIASES, PRIORITY_ALIASES } from "@/lib/fusion/dictionaries";
import type { CanonicalCategory, CanonicalPriority, CanonicalStatus } from "@/lib/fusion/schema";

const plain = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Albanian display label for a dictionary entry: the first alias, or its ë/ç spelling when the
 *  dictionary lists one right after it (the aliases exist to match ASCII-only exports, not to be shown). */
const display = (aliases: string[]) => aliases.find((a) => a !== aliases[0] && plain(a) === plain(aliases[0])) ?? aliases[0];

export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_ALIASES).map(([k, v]) => [k, display(v)])
) as Record<CanonicalStatus, string>;
export const CATEGORY_LABEL = Object.fromEntries(
  Object.entries(CATEGORY_ALIASES).map(([k, v]) => [k, display(v)])
) as Record<CanonicalCategory, string>;
export const PRIORITY_LABEL = Object.fromEntries(
  Object.entries(PRIORITY_ALIASES).map(([k, v]) => [k, display(v)])
) as Record<CanonicalPriority, string>;

/** Status colors for charts: validated with the dataviz palette checker
 *  (green / amber / red stay distinguishable for colour-blind readers). See globals.css. */
export const STATUS_COLOR: Record<CanonicalStatus, string> = {
  resolved: "var(--bc-st-resolved)",
  in_progress: "var(--bc-st-progress)",
  open: "var(--bc-st-open)",
};
export const STATUS_ORDER: CanonicalStatus[] = ["resolved", "in_progress", "open"];

export const SOURCE_SHORT: Record<string, string> = {
  "1_excel_drejtoria_infrastruktures.xlsx": "Excel · Infrastrukturë",
  "2_csv_citizen_portal.csv": "CSV · Portali i Qytetarit",
  "3_pdf_raport_mujor_sherbime.pdf": "PDF · Raport Mujor",
  "4_legacy_munsys_export.txt": "Legacy · MUNSYS",
  "5_budget_allocation.csv": "CSV · Alokimi i buxhetit",
};

export function zoneLabel(zoneId: string | null): string {
  return zoneId ? zoneId.replace("area-", "Zona ") : "—";
}

const FIELD_LABEL: Record<string, string> = {
  request_id: "ID e kërkesës",
  citizen_name: "Emri i qytetarit",
  zone_id: "Zona",
  category: "Kategoria",
  description: "Përshkrimi",
  date_submitted: "Data",
  status: "Statusi",
  priority: "Prioriteti",
  cost_estimate_leke: "Kostoja e vlerësuar",
  department: "Departamenti",
};
export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

/** Turns a raw flag like "priority:unmapped" into a sentence a clerk can read. */
export function describeFlag(flag: string): string {
  const [field, reason] = flag.split(":");
  const name = fieldLabel(field);
  if (reason === "unmapped") return `${name}: ky burim nuk e ndjek këtë fushë`;
  if (reason === "unparsed") return `${name}: vlera ekzistonte por nuk u normalizua`;
  return flag;
}

export function formatLeke(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mln L`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mijë L`;
  return `${n} L`;
}

const FIELD_DESCRIPTION: Record<string, string> = {
  request_id: "Identifikuesi unik i kërkesës ose ankesës",
  citizen_name: "Emri i plotë i qytetarit që e ka paraqitur",
  zone_id: "Zona, lagjja ose rrethi i bashkisë",
  category: "Lloji i problemit: rrugë, ndriçim, ujë, mbeturina, gjelbërim ose tjetër",
  description: "Përshkrimi i lirë i problemit",
  date_submitted: "Data kur u paraqit kërkesa",
  status: "Statusi aktual: e zgjidhur, në proces ose në pritje",
  priority: "Niveli i urgjencës: normale, mesatare ose urgjente",
  cost_estimate_leke: "Kostoja e vlerësuar në lekë, kur ndiqet",
  department: "Departamenti përgjegjës i bashkisë, kur ndiqet",
};
export function fieldDescription(field: string): string {
  return FIELD_DESCRIPTION[field] ?? field;
}
