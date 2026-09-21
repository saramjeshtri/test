import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import type { RefBook } from "./records";
import type { EmbedFn } from "./embeddings";

/** One turn of the conversation as the browser keeps it. */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ToolCall {
  /** Some providers number their calls; it has to be echoed back with the result. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * The conversation inside one agent run, in a shape that no provider owns. `raw` keeps what a
 * provider sent so it can be replayed verbatim (Gemini needs its own "thought signatures" back).
 */
/** A photo attached to a question: base64 (no "data:" prefix) and its type. */
export interface ImageInput {
  mimeType: string;
  data: string;
}

export type Message =
  | { role: "user"; text: string; images?: ImageInput[] }
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: { id?: string; name: string; output: unknown }[] };

/** What the model produced in one step: words, or a request to run tools (or both). */
export interface ModelStep {
  text: string;
  toolCalls: ToolCall[];
  raw?: unknown;
}

/** A language model, or anything that can play one. The agent loop only knows this interface. */
export interface LanguageModel {
  readonly kind: "gemini" | "offline";
  /** Human-readable name, e.g. the Gemini model id. */
  readonly label: string;
  step(system: string, messages: Message[], tools: ToolSpec[]): Promise<ModelStep>;
}

/** Enough of JSON Schema for the tool parameters (the subset every provider accepts). */
export interface ParamSchema {
  type: "string" | "number" | "integer" | "boolean";
  description: string;
  enum?: string[];
}

export interface ToolContext {
  data: CommandCenterData;
  refs: RefBook;
  /** Present when an embeddings provider is configured; the search tool falls back to keywords without it. */
  embed?: EmbedFn;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, ParamSchema>; required?: string[] };
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> | unknown;
  /** One short line for the "how I found this" trail shown to the user. */
  summarize(output: unknown): string;
}

export interface Citation {
  ref: string;
  zone: string | null;
  category: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  date: string | null;
  source: string;
  sourceRow: string;
}

export interface TraceStep {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  error?: boolean;
}

/** The zone insight behind an answer, when a zone was looked at: shown as a callout. */
export interface AgentInsight {
  zone: string;
  headline: string;
  recommendation: string | null;
}

export interface AgentResult {
  answer: string;
  citations: Citation[];
  trace: TraceStep[];
  mode: "gemini" | "offline";
  model: string;
  /** Something the user should know about how this answer was produced. */
  notice?: string;
  /** True when the model answered from its general knowledge of Elbasan, not from the municipality's data. */
  general: boolean;
  /** The zone the answer is about (e.g. "area-3"), so the page can show it next to the chat. */
  focusZone?: string;
  insight?: AgentInsight;
}
