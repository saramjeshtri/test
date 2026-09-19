"use client";

import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import type { ZoneStats } from "@/lib/commandCenter/aggregate";

/**
 * A real frontend entry point, not a fake AI backend: there is no language
 * model behind this. Submitting anything runs one honest, deterministic
 * action against real data -- surfacing the zone with the actual highest
 * severity score (the same score driving the map colors and zone list) and
 * jumping to it. The point is to make the "ask the city a question"
 * interaction visible in the product without pretending a real NLP/RAG
 * system exists yet.
 */
export default function AskBusulla({
  topZone,
  onAsk,
}: {
  topZone: ZoneStats | null;
  onAsk: (zoneId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [answered, setAnswered] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topZone) return;
    setAnswered(true);
    onAsk(topZone.zoneId);
  }

  const unresolved = topZone ? topZone.open + topZone.inProgress : 0;

  return (
    <div
      className="bc-glass rounded-[14px] overflow-hidden"
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5 px-3.5 py-2.5">
        <Sparkles size={13} style={{ color: "var(--bc-forest)" }} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAnswered(false);
          }}
          placeholder="Çfarë ka nevojë për vëmendje në Elbasan sot?"
          className="flex-1 bg-transparent text-[12px] focus:outline-none"
          style={{ color: "var(--bc-text)" }}
        />
        <button
          type="submit"
          disabled={!topZone}
          aria-label="Pyet Busulla"
          className="bc-press w-7 h-7 rounded-[9px] grid place-items-center shrink-0 disabled:opacity-40"
          style={{ background: "var(--bc-forest)", color: "#FFFFFF" }}
        >
          <ArrowRight size={12} />
        </button>
      </form>
      {answered && topZone && (
        <div
          className="bc-pop px-3 py-2 text-[11.5px] border-t"
          style={{ borderColor: "var(--bc-border)", color: "var(--bc-text-secondary)" }}
        >
          <span style={{ color: "var(--bc-text)", fontWeight: 600 }}>{topZone.zoneLabel}</span> ka nevojën më të
          madhe për vëmendje tani: {topZone.total} kërkesa, {unresolved} të pazgjidhura.
        </div>
      )}
    </div>
  );
}
