"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus, Mic, PanelLeft, SendHorizontal, X } from "lucide-react";
import type { AgentResult } from "@/lib/agent/types";
import ChatSidebar from "../agent/ChatSidebar";
import { ActionChips, AssistantMessage, BrandAvatar, UserMessage } from "../agent/MessageView";
import { useSpeechInput } from "../agent/useSpeechInput";
import { MAX_PHOTOS, prepareImage, type PreparedImage } from "../agent/images";
import { getChats, getServerChats, saveChats, subscribeChats, timestamp, type Chat, type StoredMessage } from "../agent/chatStore";

const DATA_SUGGESTIONS = [
  "Cila zonë kërkon më shumë vëmendje?",
  "Sa kërkesa të pazgjidhura ka Zona 3?",
  "Si ka ecur numri i kërkesave çdo muaj?",
  "Sa buxhet ka mbetur në Zona 5?",
  "Nëse kemi 1.5 mln L këtë muaj, çfarë të rregullojmë së pari?",
  "Ka ankesa për zhurmë?",
];
// Only offered when a language model is connected: the key-less mode can't answer these.
const GENERAL_SUGGESTIONS = ["Çfarë vendesh vlen të vizitosh në Elbasan?", "Më trego shkurt historinë e Elbasanit."];

interface Status {
  configured: boolean;
  model: string | null;
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** What is asked when a photo is sent with no words. */
const PHOTO_QUESTION = "Çfarë shihet në këtë foto dhe cilës kategori kërkesash i përket?";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const shortTitle = (t: string) => (t.length > 42 ? `${t.slice(0, 41).trimEnd()}…` : t);

export default function AgentView() {
  const chats = useSyncExternalStore(subscribeChats, getChats, getServerChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [photos, setPhotos] = useState<PreparedImage[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // null = "follow the screen size" (open on wide screens); true/false = the user chose.
  const [sidePref, setSidePref] = useState<boolean | null>(null);
  const isLg = useMedia("(min-width: 1024px)");
  const endRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const resizeField = () => {
    const f = fieldRef.current;
    if (!f) return;
    f.style.height = "auto";
    f.style.height = `${Math.min(f.scrollHeight, 120)}px`;
  };
  const voice = useSpeechInput((text) => {
    setInput(text);
    requestAnimationFrame(resizeField);
  });

  async function addPhotos(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    if (files.length === 0) return;
    if (room <= 0) return setPhotoError(`Mund të dërgosh më së shumti ${MAX_PHOTOS} foto.`);
    setPhotoError(null);
    const added: PreparedImage[] = [];
    for (const file of files.slice(0, room)) {
      try {
        added.push(await prepareImage(file));
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : "Nuk e shtova dot foton.");
      }
    }
    if (files.length > room) setPhotoError(`Mund të dërgosh më së shumti ${MAX_PHOTOS} foto.`);
    if (added.length) setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
  }

  const active = chats.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];
  const busy = loadingId !== null && loadingId === activeId;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  useEffect(() => {
    let alive = true;
    fetch("/api/agent")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => alive && s && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy, activeId]);

  async function send(raw: string) {
    const sending = photos;
    const text = raw.trim() || (sending.length > 0 ? PHOTO_QUESTION : "");
    if (!text || busy) return;
    voice.stop();

    const id = active?.id ?? newId();
    const before = getChats();
    const existing = before.find((c) => c.id === id);
    const history: StoredMessage[] = [...(existing?.messages ?? []), { role: "user", text, ...(sending.length ? { images: sending.map((p) => p.thumb) } : {}) }];
    const chat: Chat = { id, title: existing?.title ?? shortTitle(text), updatedAt: timestamp(), messages: history };
    saveChats([chat, ...before.filter((c) => c.id !== id)]);
    setActiveId(id);
    setLoadingId(id);
    setInput("");
    setPhotos([]);
    setPhotoError(null);
    if (fieldRef.current) fieldRef.current.style.height = "auto";

    let reply: StoredMessage;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The model needs only the words of the conversation so far.
        body: JSON.stringify({
          messages: history.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          // Only the newest question carries photos.
          ...(sending.length ? { images: sending.map(({ mimeType, data }) => ({ mimeType, data })) } : {}),
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json().catch(() => null);
      reply =
        !res.ok || !body || typeof body.answer !== "string"
          ? { role: "assistant", text: body?.error ?? "Nuk mora përgjigje. Provo përsëri.", failed: true }
          : { role: "assistant", text: (body as AgentResult).answer, result: body as AgentResult };
    } catch {
      reply = { role: "assistant", text: "Nuk u arrit lidhja me agjentin. Kontrollo që serveri është në punë dhe provo përsëri.", failed: true };
    }

    const now = getChats();
    const current = now.find((c) => c.id === id);
    if (current) saveChats([{ ...current, updatedAt: timestamp(), messages: [...current.messages, reply] }, ...now.filter((c) => c.id !== id)]);
    setLoadingId((l) => (l === id ? null : l));
    fieldRef.current?.focus();
  }

  const deleteChat = (id: string) => {
    saveChats(getChats().filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  // Display classes: default follows the screen; below the breakpoint an opened panel floats over the chat.
  const sideClass = (sidePref === null ? "hidden lg:flex" : sidePref ? "flex" : "hidden") + " max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-2xl";
  const openSideButton = sidePref === false ? "" : sidePref === null ? "lg:hidden" : "hidden";
  const iconButton = "bc-press grid place-items-center w-9 h-9 rounded-[10px] hover:bg-[var(--bc-panel-hover)]";

  const suggestions = status?.configured ? [...DATA_SUGGESTIONS, ...GENERAL_SUGGESTIONS] : DATA_SUGGESTIONS;

  return (
    <div className="relative flex gap-4 h-[calc(100dvh-8.25rem)] min-h-[520px]">
      <ChatSidebar
        className={sideClass}
        chats={chats}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setActiveId(null)}
        onDelete={deleteChat}
        onClose={() => setSidePref(false)}
      />

      <section
        className="bc-rise flex-1 min-w-0 flex flex-col rounded-[14px] border overflow-hidden"
        style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
      >
        <header className="flex items-center gap-3 h-[60px] px-4 shrink-0 border-b" style={{ borderColor: "var(--bc-border)" }}>
          <button onClick={() => setSidePref(sidePref === null ? !isLg : !sidePref)} aria-label="Hap listën e bisedave" title="Bisedat" className={`${iconButton} ${openSideButton}`} style={{ color: "var(--bc-text-secondary)" }}>
            <PanelLeft size={17} />
          </button>
          <BrandAvatar size={38} />
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold leading-tight" style={{ color: "var(--bc-text)" }}>Busulla Agent</h1>
            <p className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
              <span className={`w-1.5 h-1.5 rounded-full ${busy ? "animate-pulse" : ""}`} style={{ background: busy ? "var(--bc-st-progress)" : "var(--bc-st-resolved)" }} />
              {busy ? "Po analizon…" : "Gati për analizë"}
            </p>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-5" role="log" aria-live="polite" aria-label="Biseda me agjentin">
          {messages.length === 0 ? (
            <div className="m-auto max-w-[680px] text-center py-6">
              <span className="mx-auto block w-fit"><BrandAvatar size={64} /></span>
              <h2 className="mt-4 text-[18px] font-bold" style={{ color: "var(--bc-text)" }}>Çfarë do të dish për Elbasanin?</h2>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                {status?.configured ? "Pyet për të dhënat e bashkisë ose për qytetin në përgjithësi." : "Pyet për kërkesat, zonat dhe buxhetin."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="bc-press text-[12.5px] font-medium px-4 py-2 rounded-full border text-left transition-colors hover:bg-[var(--bc-panel-hover)]"
                    style={{ borderColor: "var(--bc-border)", color: "var(--bc-text)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-3">
                {m.role === "user" ? <UserMessage text={m.text} images={m.images} /> : <AssistantMessage msg={m} />}
                {m.role === "assistant" && m === lastAssistant && !busy && m.result && m.result.trace.length > 0 && (
                  <ActionChips focusZone={m.result.focusZone} onAsk={send} />
                )}
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2.5 text-[12.5px]" style={{ color: "var(--bc-text-secondary)" }}>
              <span className="animate-pulse"><BrandAvatar /></span>
              Po kërkoj në të dhëna…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="shrink-0 px-4 pb-4 pt-2"
        >
          {(voice.error || photoError) && (
            <p role="status" className="px-2 pb-2 text-[12px]" style={{ color: "var(--bc-st-progress)" }}>
              {photoError ?? voice.error}
            </p>
          )}
          <div className="rounded-[18px] border transition-colors focus-within:border-[var(--bc-forest)]" style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface-2)" }}>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {photos.map((p, i) => (
                <span key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small data URL made in the browser */}
                  <img src={p.thumb} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-[10px] object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Hiq foton ${i + 1}`}
                    className="bc-press absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full border"
                    style={{ background: "var(--bc-surface)", borderColor: "var(--bc-border)", color: "var(--bc-text)" }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 pl-2 pr-2 py-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(Array.from(e.target.files ?? []));
                e.target.value = ""; // so choosing the same photo again works
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Shto foto"
              title="Shto foto (dërgohet te modeli që e analizon)"
              className="bc-press grid place-items-center w-10 h-10 rounded-full shrink-0 hover:bg-[var(--bc-panel-hover)] disabled:opacity-40"
              style={{ color: "var(--bc-text-secondary)" }}
            >
              <ImagePlus size={18} />
            </button>
            <textarea
              ref={fieldRef}
              value={input}
              rows={1}
              maxLength={800}
              onChange={(e) => {
                setInput(e.target.value);
                resizeField();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                } else if (e.key === "Escape") {
                  voice.stop();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                if (files.length) {
                  e.preventDefault();
                  void addPhotos(files);
                }
              }}
              placeholder={voice.listening ? "Po dëgjoj… fol tani" : photos.length ? "Shto një pyetje për foton (ose dërgoje ashtu)…" : "Pyet Busullën…"}
              aria-label="Pyetja"
              className="flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-snug focus:outline-none"
              style={{ color: "var(--bc-text)" }}
            />
            {voice.supported && (
              <button
                type="button"
                onClick={() => voice.toggle(input)}
                aria-label={voice.listening ? "Ndalo dëgjimin" : "Folë me zë"}
                aria-pressed={voice.listening}
                title={voice.listening ? "Ndalo" : "Folë me zë"}
                className={`bc-press grid place-items-center w-10 h-10 rounded-full shrink-0 transition-colors ${voice.listening ? "animate-pulse" : "hover:bg-[var(--bc-panel-hover)]"}`}
                style={{
                  background: voice.listening ? "color-mix(in srgb, var(--bc-st-open) 18%, transparent)" : "transparent",
                  color: voice.listening ? "var(--bc-st-open)" : "var(--bc-text-secondary)",
                }}
              >
                <Mic size={18} />
              </button>
            )}
            <button
              type="submit"
              disabled={(!input.trim() && photos.length === 0) || busy}
              aria-label="Dërgo"
              className="bc-press grid place-items-center w-10 h-10 rounded-full shrink-0 disabled:opacity-40"
              style={{ background: "var(--bc-forest)", color: "#fff" }}
            >
              <SendHorizontal size={17} />
            </button>
          </div>
          </div>
        </form>
      </section>

    </div>
  );
}
