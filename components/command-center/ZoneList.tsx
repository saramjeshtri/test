import type { ZoneStats } from "@/lib/commandCenter/aggregate";
import { severityToColor, severityDomain, severityLabel } from "@/lib/commandCenter/severityColor";

function zoneNumber(zoneId: string): string {
  return zoneId.replace("area-", "");
}

/** One plain-language line per zone -- how many requests are still waiting -- instead of
 *  a score, a total and a budget bar side by side. The details appear once a zone is opened. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="bc-mono text-[15px] font-bold leading-none" style={{ color: "var(--bc-text)" }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] leading-tight" style={{ color: "var(--bc-text-secondary)" }}>
        {label}
      </div>
    </div>
  );
}

export default function ZoneList({
  zones,
  selectedZone,
  onSelect,
}: {
  zones: ZoneStats[];
  selectedZone: string | null;
  onSelect: (zoneId: string) => void;
}) {
  const domain = severityDomain(zones.map((z) => z.severityScore));

  return (
    <div>
      {zones.map((z, i) => {
        const active = selectedZone === z.zoneId;
        const color = severityToColor(z.severityScore, domain);
        const pending = z.open + z.inProgress;

        return (
          <button
            key={z.zoneId}
            onClick={() => onSelect(z.zoneId)}
            aria-pressed={active}
            className="w-full text-left px-3.5 py-3 transition-colors duration-150 hover:bg-[var(--bc-panel-hover)]"
            style={{
              borderBottom: i < zones.length - 1 ? "1px solid var(--bc-border)" : "none",
              background: active ? "var(--bc-panel-active)" : undefined,
              boxShadow: active ? "inset 3px 0 0 var(--bc-forest)" : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`flex items-center gap-2 ${active ? "text-[14px] font-semibold" : "text-[13px] font-medium"}`}
                style={{ color: "var(--bc-text)" }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                Zona {zoneNumber(z.zoneId)}
              </span>
              <span
                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ color: "var(--bc-text)", background: `color-mix(in srgb, ${color} 18%, transparent)` }}
              >
                {severityLabel(z.severityScore)}
              </span>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
              {pending === 0 ? "Asnjë kërkesë në pritje" : `${pending} ${pending === 1 ? "kërkesë" : "kërkesa"} të pazgjidhura`}
            </div>

            {active && (
              <div className="bc-pop mt-3 pt-3 grid grid-cols-3 gap-2 border-t" style={{ borderColor: "var(--bc-border)" }}>
                <Detail label="kërkesa gjithsej" value={String(z.total)} />
                <Detail label="të zgjidhura" value={String(z.resolved)} />
                {z.budget ? (
                  <Detail label="buxheti i përdorur" value={`${z.budget.spentPct}%`} />
                ) : (
                  <Detail label="në proces" value={String(z.inProgress)} />
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
