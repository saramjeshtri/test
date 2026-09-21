import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import { runAgent } from "./agent";
import { geminiEmbedder } from "./embeddings";
import { ModelError, geminiModel } from "./gemini";
import { offlineModel } from "./offline";
import { RefBook } from "./records";
import { requestDocText } from "./tools";
import { withTimeout } from "./time";
import type { AgentResult, ChatTurn, ImageInput, ToolContext } from "./types";

/**
 * Server-only entry point: reads the data, picks the model, runs the agent.
 *
 * Environment variables (all optional, read on the server only, never sent to the browser):
 *   GEMINI_API_KEY          key from Google AI Studio. Without it the agent runs in "no model" mode.
 *   GEMINI_MODEL            model id, default below. Change it if your free tier doesn't offer the default.
 *   GEMINI_EMBEDDING_MODEL  embedding model for search by meaning, default below.
 */

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
/** However slow Gemini is, a person waits at most this long before the rule-based fallback answers. */
const DEADLINE_MS = 45_000;

export interface AgentStatus {
  configured: boolean;
  /** The model that will answer: the Gemini id, or null in "no model" mode. */
  model: string | null;
}

export function agentStatus(): AgentStatus {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  return { configured, model: configured ? process.env.GEMINI_MODEL || DEFAULT_MODEL : null };
}

let warmed = false;

/** Starts embedding every request in the background, so the first search by meaning finds it ready. */
export function warmUp(): void {
  const key = process.env.GEMINI_API_KEY;
  if (!key || warmed) return;
  warmed = true;
  const embed = geminiEmbedder(key, process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL);
  embed(loadCommandCenterData().records.map(requestDocText), "document").catch(() => {
    warmed = false; // try again on the next visit
  });
}

function context(embed?: ToolContext["embed"]): ToolContext {
  return { data: loadCommandCenterData(), refs: new RefBook(), embed };
}

function shortReason(err: unknown): string {
  if (err instanceof ModelError) return err.status ? `gabim ${err.status}` : "nuk u arrit lidhja";
  if (err instanceof Error && /took longer/.test(err.message)) return "u vonua shumë";
  return "gabim i papritur";
}

export async function answer(turns: ChatTurn[], images?: ImageInput[]): Promise<AgentResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return runAgent({ turns, images, model: offlineModel, ctx: context() });

  const modelId = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const embed = geminiEmbedder(key, process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL);
  try {
    return await withTimeout(runAgent({ turns, images, model: geminiModel(key, modelId), ctx: context(embed) }), DEADLINE_MS, "The agent");
  } catch (err) {
    // Keep the demo alive: say what happened, and answer with the rule-based model instead.
    console.error("[agent] Gemini failed, using the offline model:", err instanceof Error ? err.message : err);
    const fallback = await runAgent({ turns, images, model: offlineModel, ctx: context() });
    const notice = `Gemini nuk u përgjigj (${shortReason(err)}); ky përgjigje u dha nga mënyra pa model.`;
    return { ...fallback, notice: fallback.notice ? `${notice} ${fallback.notice}` : notice };
  }
}
