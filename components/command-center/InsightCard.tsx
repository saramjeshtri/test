"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, ChevronDown, Crosshair } from "lucide-react";
import type { Insight, Seg } from "@/lib/commandCenter/insights";
import Panel from "./Panel";

function Text({ parts }: { parts: Seg[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <strong key={i} className="font-bold" style={{ color: "var(--bc-text)" }}>
            {p.b}
          </strong>
        )
      )}
    </>
  );
}

/**
 * The "so what" of the page. With a zone selected it explains that zone; with none selected it
 * points at the zone that most needs attention. The parent keys it by zone, so choosing a zone
 * replays the staged entrance: what changed first, then what to do about it.
 */
export default function InsightCard({
  insight,
  color,
  selected,
  onOpenZone,
  onViewEvidence,
  onPlan,
}: {
  insight: Insight;
  color: string;
  /** false = nothing selected, this is the city-level pointer to the top zone. */
  selected: boolean;
  onOpenZone: (zoneId: string) => void;
  onViewEvidence: () => void;
  onPlan: () => void;
}) {
  const [why, setWhy] = useState(false);

  return (
    <Panel
      title={selected ? `Analiza · ${insight.zoneLabel}` : "Kërkon vëmendje"}
      icon={<Sparkles size={14} style={{ color }} />}
      accent={color}
      rise={false}
      right={
        selected ? (
          <span
            className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ color: "var(--bc-text)", background: `color-mix(in srgb, ${color} 20%, transparent)` }}
          >
            {insight.level}
          </span>
        ) : (
          <button
            onClick={() => onOpenZone(insight.zoneId)}
            className="bc-press inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ color: "var(--bc-forest)", background: "var(--bc-forest-tint)" }}
          >
            {insight.zoneLabel} <ArrowRight size={12} />
          </button>
        )
      }
    >
      <p className="bc-slide text-[12.5px] leading-snug" style={{ color: "var(--bc-text-secondary)", animationDelay: "120ms" }}>
        <Text parts={insight.headline} />
      </p>

      {insight.action && (
        <div
          className="bc-slide mt-3 rounded-[10px] px-3 py-2.5"
          style={{ background: `color-mix(in srgb, ${color} 10%, var(--bc-surface-2))`, animationDelay: "380ms" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-semibold tracking-[0.1em]" style={{ color: "var(--bc-text-secondary)" }}>
              REKOMANDIM
            </span>
            <span className="flex items-center gap-2.5">
              <button
                onClick={onViewEvidence}
                className="bc-press inline-flex items-center gap-0.5 text-[11px] font-semibold"
                style={{ color: "var(--bc-forest)" }}
              >
                Kërkesat <ArrowRight size={11} />
              </button>
              <button
                onClick={onPlan}
                className="bc-press inline-flex items-center gap-0.5 text-[11px] font-semibold"
                style={{ color: "var(--bc-forest)" }}
              >
                Plani <ArrowRight size={11} />
              </button>
              <button
                onClick={() => setWhy((w) => !w)}
                aria-expanded={why}
                className="bc-press inline-flex items-center gap-0.5 text-[11px] font-semibold"
                style={{ color: "var(--bc-forest)" }}
              >
                Pse? <ChevronDown size={12} style={{ transform: why ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }} />
              </button>
            </span>
          </div>
          <div className="mt-1 flex items-start gap-2 text-[12.5px]" style={{ color: "var(--bc-text-secondary)" }}>
            <Crosshair size={13} className="mt-0.5 shrink-0" style={{ color }} />
            <div>
              <Text parts={insight.action.title} />
              <div className="mt-0.5 text-[11.5px]">{insight.action.detail}</div>
            </div>
          </div>
          {why && (
            <dl className="bc-pop mt-2.5 pt-2.5 border-t flex flex-col gap-1.5 text-[11.5px]" style={{ borderColor: "var(--bc-border)" }}>
              {insight.facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-3">
                  <dt style={{ color: "var(--bc-text-secondary)" }}>{f.label}</dt>
                  <dd className="bc-mono text-right font-medium" style={{ color: "var(--bc-text)" }}>{f.value}</dd>
                </div>
              ))}
              <div className="text-[10.5px] pt-0.5" style={{ color: "var(--bc-text-secondary)" }}>
                Nga {insight.basedOn} kërkesa · të dhëna deri më {insight.asOf}
              </div>
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}
