import type { CanonicalCategory, CanonicalPriority, CanonicalStatus } from "./schema";

/**
 * Column-name aliases seen across the 4+2026 municipal export formats, keyed
 * by canonical field. Matched against source headers after normalization
 * (lowercased, diacritics stripped, punctuation/spaces removed) -- see
 * normalize.ts. Extend this list first before reaching for the LLM fallback
 * once the real Track D data package arrives; it's the cheapest, fastest,
 * most reliable path when it applies.
 */
export const HEADER_ALIASES: Record<string, string[]> = {
  request_id: ["Nr.", "request_id", "REQ_ID", "id"],
  citizen_name: ["Emri i qytetarit", "full_name", "Emer i plote", "CTZ_NM", "name"],
  zone_id: ["Zona", "neighborhood", "Vendndodhja", "ZN", "zone_ref", "district"],
  category: ["Kategoria", "issue_type", "Lloji i problemit", "CAT_CD", "category"],
  description: ["Pershkrimi", "Përshkrimi", "notes", "DESC", "description"],
  date_submitted: ["Data e paraqitjes", "submitted_on", "Data", "DT_SUB", "date"],
  status: ["Statusi", "current_status", "Gjendja", "STS", "status"],
  priority: ["Perparesia", "Përparësia", "urgency", "PRI", "priority"],
  cost_estimate_leke: ["Kosto e vleresuar (Leke)", "Kosto e vlerësuar (Lekë)", "COST_LEK", "cost"],
  department: ["dept", "Departamenti", "department"],
};

/** Status vocabulary: normalized source value -> canonical status. */
export const STATUS_ALIASES: Record<CanonicalStatus, string[]> = {
  resolved: ["Zgjidhur", "Perfunduar", "Përfunduar", "Resolved", "R"],
  in_progress: ["Ne proces", "Në proces", "Ne vazhdim", "Në vazhdim", "In Progress", "P"],
  open: ["Ne pritje", "Në pritje", "Pa filluar", "Open", "O"],
};

export const CATEGORY_ALIASES: Record<CanonicalCategory, string[]> = {
  road: ["Rruge", "Rrugë", "Roads", "RD"],
  lighting: ["Ndricim publik", "Ndriçim publik", "Public Lighting", "LGT"],
  water: ["Ujesjelles/Kanalizime", "Ujësjellës/Kanalizime", "Water/Sewage", "WTR"],
  waste: ["Mbeturina", "Waste Collection", "WST"],
  green: ["Hapesira te gjelbra", "Hapësira të gjelbra", "Green Spaces", "GRN"],
  other: ["Tjeter", "Tjetër", "Other", "OTH"],
};

export const PRIORITY_ALIASES: Record<CanonicalPriority, string[]> = {
  low: ["Normale", "Low", "1"],
  medium: ["Mesatare", "Medium", "2"],
  high: ["Urgjente", "High", "3"],
};
