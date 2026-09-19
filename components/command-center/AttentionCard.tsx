import { AlertTriangle, ArrowRight } from "lucide-react";
import type { ZoneStats } from "@/lib/commandCenter/aggregate";
import { severityToColor } from "@/lib/commandCenter/severityColor";
import Panel from "./Panel";

/** The single most-in-need-of-attention zone, by the same real severity
 *  score used everywhere else (map colors, zone list) -- not a separate
 *  metric invented for this card. */
export function topPriorityZone(zones: ZoneStats[]): ZoneStats | null {
  if (zones.length === 0) return null;
  return [...zones].sort((a, b) => b.severityScore - a.severityScore)[0];
}

export default function AttentionCard({
  zone,
  domain,
  onViewEvidence,
}: {
  zone: ZoneStats;
  domain: [number, number];
  onViewEvidence: () => void;
}) {
  const color = severityToColor(zone.severityScore, domain);
  const unresolved = zone.open + zone.inProgress;

  return (
    <Panel title="Kërkon vëmendje" icon={<AlertTriangle size={14} style={{ color }} />} accent={color}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[20px] font-bold leading-none" style={{ color: "var(--bc-text)" }}>
            {zone.zoneLabel}
          </div>
          <div className="mt-2 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
            {zone.total} kërkesa · {unresolved} të pazgjidhura
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="bc-mono text-[30px] font-bold leading-none" style={{ color }}>
            {zone.severityScore}
          </div>
          <div className="mt-1 text-[9px] font-semibold tracking-[0.1em]" style={{ color: "var(--bc-text-secondary)" }}>
            NIVELI I RREZIKUT · 0–100
          </div>
        </div>
      </div>
      <button
        onClick={onViewEvidence}
        className="bc-press group mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
        style={{ color: "var(--bc-forest)", background: "var(--bc-forest-tint)" }}
      >
        Shiko evidencën <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </Panel>
  );
}
