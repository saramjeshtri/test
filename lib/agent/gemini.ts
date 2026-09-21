import type { LanguageModel, Message, ModelStep, ToolCall, ToolSpec } from "./types";

/**
 * Gemini as the agent's language model, over plain `fetch` (no SDK, per the project's rule of
 * not adding dependencies). Uses the documented `generateContent` endpoint: the WHOLE conversation is
 * sent every time, so nothing is stored on Google's side and every step can be inspected.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const ATTEMPT_MS = 12_000;

/** The API refused, was unreachable or answered nonsense. Carries the HTTP status when there was one. */
export class ModelError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ModelError";
  }
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
}
interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

/** Our provider-neutral history -> Gemini's `contents`. */
export function toGeminiContents(messages: Message[]): GeminiContent[] {
  return messages.map((m): GeminiContent => {
    if (m.role === "user") {
      // Photos go first, then the question about them.
      const photos = (m.images ?? []).map((i): GeminiPart => ({ inlineData: { mimeType: i.mimeType, data: i.data } }));
      return { role: "user", parts: [...photos, { text: m.text }] };
    }
    if (m.role === "assistant") {
      // Replay what the model actually sent (this keeps its thought signatures); only chat history
      // coming from the browser has no `raw`, and that is plain text.
      if (m.raw) return m.raw as GeminiContent;
      return { role: "model", parts: [{ text: m.text }] };
    }
    return {
      role: "user",
      parts: m.results.map((r) => ({
        functionResponse: { ...(r.id ? { id: r.id } : {}), name: r.name, response: { result: r.output } },
      })) as GeminiPart[],
    };
  });
}

/** Gemini's reply -> our `ModelStep`. Throws `ModelError` for blocked, empty or malformed replies. */
export function parseGeminiReply(data: unknown): ModelStep {
  const d = data as {
    candidates?: { content?: GeminiContent; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = d?.candidates?.[0];
  if (!candidate?.content) {
    const why = d?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no candidate";
    throw new ModelError(`Gemini returned no answer (${why})`);
  }
  const parts = candidate.content.parts ?? [];
  const text = parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("");
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
  if (!text.trim() && toolCalls.length === 0) {
    throw new ModelError(`Gemini returned an empty answer (${candidate.finishReason ?? "unknown reason"})`);
  }
  return { text, toolCalls, raw: candidate.content };
}

export function geminiModel(apiKey: string, modelId: string, fetchImpl: typeof fetch = fetch): LanguageModel {
  return {
    kind: "gemini",
    label: modelId,
    async step(system: string, messages: Message[], tools: ToolSpec[]): Promise<ModelStep> {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: toGeminiContents(messages),
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      };

      // One retry when it is slow or overloaded. The free tier answers in ~2s but now and then stalls for
      // 20s+ on an identical request, and a second try is nearly always fast, so wait little and retry.
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await fetchImpl(`${BASE}/models/${modelId}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(ATTEMPT_MS),
          });
        } catch (err) {
          if (attempt === 0) continue; // timed out or dropped: try once more straight away
          throw new ModelError(`Could not reach Gemini: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (res.ok) return parseGeminiReply(await res.json());
        if (attempt === 0 && (res.status === 429 || res.status === 500 || res.status === 503)) {
          await new Promise((r) => setTimeout(r, res.status === 429 || res.status === 503 ? 1500 : 300));
          continue;
        }
        throw new ModelError(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 400)}`, res.status);
      }
    },
  };
}
