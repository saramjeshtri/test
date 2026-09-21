/**
 * Retrieval by meaning (the "R" in RAG). A text becomes a list of numbers (an embedding) such that
 * texts with similar meaning get similar numbers, in any of the languages the model knows -- so
 * "zhurmë" finds "Noise complaint". Requests are embedded once and cached in memory; a question is
 * embedded per search. Only category, zone and description are embedded: never a citizen's name.
 */

export type EmbedKind = "document" | "query";
export type EmbedFn = (texts: string[], kind: EmbedKind) => Promise<number[][]>;

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const BATCH = 16; // small batches run in parallel: much faster than one big one, and one slow batch hurts less
const DIMENSIONS = 768;
const ATTEMPT_MS = 10_000;

/** Shared across requests for the life of the server process, so each text is embedded once. */
const cache = new Map<string, number[]>();
/** Texts being embedded right now: a second caller waits for the same answer instead of asking again. */
const inFlight = new Map<string, Promise<number[]>>();

class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Text as the embedding model wants it. The newer model takes its task from the text itself. */
function withTask(model: string, text: string, kind: EmbedKind): string {
  if (model.includes("001")) return text;
  return kind === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
}

/** One batch request, retried once: the free tier has random slow moments that a second try usually avoids. */
async function embedBatch(apiKey: string, model: string, texts: string[], kind: EmbedKind, fetchImpl: typeof fetch): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchImpl(`${BASE}/models/${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text: withTask(model, text, kind) }] },
            outputDimensionality: DIMENSIONS,
            ...(model.includes("001") ? { taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" } : {}),
          })),
        }),
        signal: AbortSignal.timeout(ATTEMPT_MS),
      });
      if (!res.ok) throw new EmbeddingError(`Embeddings API error ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const data = await res.json();
      const vectors: { values?: number[] }[] = data.embeddings ?? (data.embedding ? [data.embedding] : []);
      if (vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v.values))) {
        throw new EmbeddingError("Embeddings API returned an unexpected shape");
      }
      return vectors.map((v) => v.values as number[]);
    } catch (err) {
      const status = err instanceof EmbeddingError ? err.status : undefined;
      const permanent = status !== undefined && status < 500 && status !== 429; // a bad request won't fix itself
      if (attempt === 1 || permanent) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

export function geminiEmbedder(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): EmbedFn {
  return async (texts, kind) => {
    const keyFor = (t: string) => `${model}|${kind}|${t}`;
    const needed = [...new Set(texts)].filter((t) => !cache.has(keyFor(t)) && !inFlight.has(keyFor(t)));

    for (let i = 0; i < needed.length; i += BATCH) {
      const chunk = needed.slice(i, i + BATCH);
      const batch = embedBatch(apiKey, model, chunk, kind, fetchImpl);
      chunk.forEach((text, j) => {
        const key = keyFor(text);
        const one = batch.then(
          (vectors) => {
            const v = normalize(vectors[j]);
            cache.set(key, v);
            inFlight.delete(key);
            return v;
          },
          (err) => {
            inFlight.delete(key);
            throw err;
          }
        );
        one.catch(() => {}); // the caller below sees the failure; this only keeps it from going unhandled
        inFlight.set(key, one);
      });
    }
    return Promise.all(texts.map((t) => cache.get(keyFor(t)) ?? (inFlight.get(keyFor(t)) as Promise<number[]>)));
  };
}

/** Both vectors are unit length, so the dot product is the cosine similarity (1 = same meaning). */
export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** The `k` documents whose meaning is closest to the query, best first. */
export async function semanticRank<T>(
  embed: EmbedFn,
  query: string,
  docs: { item: T; text: string }[],
  k: number
): Promise<{ item: T; score: number }[]> {
  if (docs.length === 0) return [];
  const [q] = await embed([query], "query");
  const vectors = await embed(
    docs.map((d) => d.text),
    "document"
  );
  return docs
    .map((d, i) => ({ item: d.item, score: cosine(q, vectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
