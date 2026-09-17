import { CATEGORY_ALIASES, PRIORITY_ALIASES, STATUS_ALIASES } from "./dictionaries";
import { normalizeToken } from "./normalize";
import type { CanonicalCategory, CanonicalPriority, CanonicalStatus } from "./schema";

function buildLookup<T extends string>(aliasMap: Record<T, string[]>): Record<string, T> {
  const lookup: Record<string, T> = {} as Record<string, T>;
  for (const [canonical, aliases] of Object.entries(aliasMap) as [T, string[]][]) {
    for (const alias of aliases) lookup[normalizeToken(alias)] = canonical;
  }
  return lookup;
}

const STATUS_LOOKUP = buildLookup(STATUS_ALIASES);
const CATEGORY_LOOKUP = buildLookup(CATEGORY_ALIASES);
const PRIORITY_LOOKUP = buildLookup(PRIORITY_ALIASES);

export function resolveStatus(raw: string): CanonicalStatus | null {
  return STATUS_LOOKUP[normalizeToken(raw)] ?? null;
}

export function resolveCategory(raw: string): CanonicalCategory | null {
  return CATEGORY_LOOKUP[normalizeToken(raw)] ?? null;
}

export function resolvePriority(raw: string): CanonicalPriority | null {
  return PRIORITY_LOOKUP[normalizeToken(raw)] ?? null;
}

/** Extracts the zone number from any known naming convention (Zona 5, District 5,
 *  Z5, Lagjja Nr. 5, ...) and maps it to the area-N id used by the map. */
export function resolveZoneId(raw: string): string | null {
  const match = raw.match(/([1-6])/);
  if (!match) return null;
  return `area-${match[1]}`;
}

/** Accepts ISO (YYYY-MM-DD), DD.MM.YYYY, DD/MM/YYYY, or raw DDMMYYYY digits. */
export function parseDateFlexible(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return null;
}

export function parseCost(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Number(digits);
}
