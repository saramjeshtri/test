import { agentStatus, answer, warmUp } from "@/lib/agent/run";
import type { AgentResult, ChatTurn, ImageInput } from "@/lib/agent/types";

/**
 * POST /api/agent   { messages: [{ role: "user" | "assistant", text }] }  ->  AgentResult
 * GET  /api/agent   -> { configured, model }  (what the page shows before the first question)
 *
 * The model key never leaves the server. Input is checked, calls are rate-limited per client, and a
 * repeated first question is served from a short cache, so a demo can't burn the credit.
 */

const MAX_TURNS = 12; // keep the last few; the model doesn't need the whole chat
const MAX_TEXT = 1500;
const MAX_QUESTION = 800;
const RATE_LIMIT = 20; // questions per minute per client
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_500_000; // base64 characters: about 1.8 MB of picture, after the page has shrunk it
const MAX_BODY_BYTES = 9_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 100;

const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; result: AgentResult }>();

function tooMany(client: string): boolean {
  const now = Date.now();
  const recent = (hits.get(client) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(client, recent);
  return recent.length > RATE_LIMIT;
}

function readTurns(body: unknown): ChatTurn[] | string {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0) return "Dërgo të paktën një mesazh.";
  const turns: ChatTurn[] = [];
  for (const m of list.slice(-MAX_TURNS)) {
    const { role, text } = (m ?? {}) as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return "Mesazhet nuk kanë formën e duhur.";
    turns.push({ role, text: text.slice(0, MAX_TEXT) });
  }
  const last = turns[turns.length - 1];
  if (last.role !== "user" || !last.text.trim()) return "Mesazhi i fundit duhet të jetë një pyetje.";
  if (last.text.length > MAX_QUESTION) return `Pyetja është shumë e gjatë (maksimumi ${MAX_QUESTION} shkronja).`;
  // The model API needs the conversation to start with the user.
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

function readImages(body: unknown): ImageInput[] | string {
  const raw = (body as { images?: unknown })?.images;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "Fotot nuk kanë formën e duhur.";
  if (raw.length > MAX_IMAGES) return `Mund të dërgosh më së shumti ${MAX_IMAGES} foto.`;
  const images: ImageInput[] = [];
  for (const item of raw) {
    const { mimeType, data } = (item ?? {}) as { mimeType?: unknown; data?: unknown };
    if (typeof mimeType !== "string" || !IMAGE_TYPES.has(mimeType)) return "Formati i fotos nuk mbështetet (JPG, PNG ose WebP).";
    if (typeof data !== "string" || data.length === 0 || !BASE64.test(data)) return "Fotoja nuk është e vlefshme.";
    if (data.length > MAX_IMAGE_CHARS) return "Fotoja është shumë e madhe.";
    images.push({ mimeType, data });
  }
  return images;
}

export async function GET() {
  warmUp(); // the page calls this when it opens: a good moment to get the search index ready
  return Response.json(agentStatus());
}

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (tooMany(client)) return Response.json({ error: "Shumë pyetje njëherësh. Provo pas pak." }, { status: 429 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Kërkesa është shumë e madhe." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Kërkesa nuk është JSON i vlefshëm." }, { status: 400 });
  }
  const turns = readTurns(body);
  if (typeof turns === "string") return Response.json({ error: turns }, { status: 400 });
  const images = readImages(body);
  if (typeof images === "string") return Response.json({ error: images }, { status: 400 });

  const mode = agentStatus().configured ? "gemini" : "offline";
  // A question with a photo is never cached: the same words about a different photo are a different question.
  const cacheKey = turns.length === 1 && images.length === 0 ? `${mode}|${turns[0].text.trim().toLowerCase()}` : null;
  const cached = cacheKey ? cache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Response.json({ ...cached.result, cached: true });

  try {
    const result = await answer(turns, images);
    // Only cache real answers: a fallback notice means something was wrong at that moment.
    if (cacheKey && !result.notice) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, { at: Date.now(), result });
    }
    return Response.json(result);
  } catch (err) {
    console.error("[agent] unexpected failure:", err);
    return Response.json({ error: "Agjenti hasi një gabim i papritur. Provo përsëri." }, { status: 500 });
  }
}
