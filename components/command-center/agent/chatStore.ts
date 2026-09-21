import type { AgentResult } from "@/lib/agent/types";

/**
 * Conversations live in the browser (localStorage), so they survive a refresh and never touch a server.
 * Exposed as an external store so React can read them without a hydration mismatch: the server
 * always renders "no conversations", and the browser swaps in the saved ones right after.
 */

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  /** Small thumbnails (data URLs) of the photos sent with a user message. */
  images?: string[];
  result?: AgentResult;
  failed?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  updatedAt: number;
  messages: StoredMessage[];
}

/** Kept here (not in the component) so time is read only when a chat is saved, never while rendering. */
export const timestamp = (): number => Date.now();

const KEY = "busulla-agent-chats";
const EVENT = "busulla-agent-chats-change";
const MAX_CHATS = 30;
const MAX_MESSAGES = 60;

const EMPTY: Chat[] = [];
let cache: { raw: string | null; chats: Chat[] } = { raw: null, chats: EMPTY };
/** Only used when the browser refuses to store anything: the chats then live until the tab closes. */
let memory: Chat[] | null = null;

function parse(raw: string | null): Chat[] {
  if (!raw) return EMPTY;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return EMPTY;
    return list.filter(
      (c): c is Chat => c && typeof c.id === "string" && typeof c.title === "string" && typeof c.updatedAt === "number" && Array.isArray(c.messages)
    );
  } catch {
    return EMPTY;
  }
}

/** The saved chats, newest first. The same array is returned until something changes. */
export function getChats(): Chat[] {
  if (memory) return memory;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY; // storage blocked (private mode): nothing saved yet
  }
  if (raw !== cache.raw) cache = { raw, chats: parse(raw) };
  return cache.chats;
}

export const getServerChats = (): Chat[] => EMPTY;

export function subscribeChats(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveChats(chats: Chat[]): void {
  const trimmed = [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS)
    .map((c) => ({ ...c, messages: c.messages.slice(-MAX_MESSAGES) }));
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    memory = null;
  } catch {
    memory = trimmed; // full or blocked: keep the chats in memory so the page still works
  }
  window.dispatchEvent(new Event(EVENT));
}
