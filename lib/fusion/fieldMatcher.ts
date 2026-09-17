import { HEADER_ALIASES } from "./dictionaries";
import { normalizeToken, similarity } from "./normalize";

export interface FieldMatch {
  sourceHeader: string;
  canonicalField: string | null;
  confidence: number;
  method: "exact" | "fuzzy" | "unmatched";
}

const EXACT_THRESHOLD = 0.92;
const FUZZY_THRESHOLD = 0.72;

/** Deterministic header -> canonical field matching. No LLM involved. */
export function matchHeader(sourceHeader: string): FieldMatch {
  const norm = normalizeToken(sourceHeader);
  let best: { field: string; score: number } | null = null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const score = similarity(norm, normalizeToken(alias));
      if (!best || score > best.score) best = { field, score };
    }
  }

  if (!best || best.score < FUZZY_THRESHOLD) {
    return { sourceHeader, canonicalField: null, confidence: best?.score ?? 0, method: "unmatched" };
  }
  return {
    sourceHeader,
    canonicalField: best.field,
    confidence: best.score,
    method: best.score >= EXACT_THRESHOLD ? "exact" : "fuzzy",
  };
}
