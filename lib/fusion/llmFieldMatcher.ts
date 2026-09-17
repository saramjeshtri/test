import { CANONICAL_FIELDS } from "./schema";

export type LlmProvider = (prompt: string) => Promise<string>;

/**
 * Real provider: calls Claude with the AI API key issued at the event.
 * Swap the model name for whatever's cheapest/fastest against the $25-50
 * team budget -- this is only invoked for headers the deterministic matcher
 * (fieldMatcher.ts) couldn't confidently place, so call volume should be low.
 */
export async function anthropicProvider(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export function buildFieldMappingPrompt(unmatched: { header: string; sampleValues: string[] }[]): string {
  const schemaDesc = CANONICAL_FIELDS.map((f) => `- ${f.field}: ${f.description}`).join("\n");
  const headerDesc = unmatched
    .map((u) => `- "${u.header}" (sample values: ${u.sampleValues.join(", ") || "none"})`)
    .join("\n");

  return [
    "You are mapping columns from a municipal data export to a canonical schema.",
    "",
    "Canonical fields:",
    schemaDesc,
    "",
    "Unmapped source columns:",
    headerDesc,
    "",
    "For each source column, return the best-matching canonical field name, or null if none fit.",
    "Respond with ONLY a JSON object mapping source column name -> canonical field name or null. No other text.",
  ].join("\n");
}

function parseFieldMappingResponse(
  raw: string,
  unmatched: { header: string }[]
): Record<string, string | null> {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const result: Record<string, string | null> = {};
    for (const u of unmatched) {
      result[u.header] = typeof parsed[u.header] === "string" ? parsed[u.header] : null;
    }
    return result;
  } catch {
    return Object.fromEntries(unmatched.map((u) => [u.header, null]));
  }
}

/**
 * Fallback for headers the deterministic matcher couldn't place. Degrades
 * gracefully (returns everything unmapped, doesn't throw) when no API key is
 * configured -- so the pipeline still runs end-to-end during prep, before the
 * event issues real AI API credits.
 */
export async function resolveUnmatchedHeaders(
  unmatched: { header: string; sampleValues: string[] }[],
  provider: LlmProvider = anthropicProvider
): Promise<Record<string, string | null>> {
  if (unmatched.length === 0) return {};

  if (provider === anthropicProvider && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `[fusion] No ANTHROPIC_API_KEY set -- skipping LLM fallback for: ${unmatched.map((u) => u.header).join(", ")}`
    );
    return Object.fromEntries(unmatched.map((u) => [u.header, null]));
  }

  try {
    const raw = await provider(buildFieldMappingPrompt(unmatched));
    return parseFieldMappingResponse(raw, unmatched);
  } catch (err) {
    console.warn(`[fusion] LLM fallback failed: ${(err as Error).message}`);
    return Object.fromEntries(unmatched.map((u) => [u.header, null]));
  }
}
