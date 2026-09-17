"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import TrendChart from "./command-center/TrendChart";
import EvidencePanel from "./command-center/EvidencePanel";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

// Deliberately not Intl.NumberFormat: its thousands-separator output for
// "sq-AL" differs between Node's ICU (SSR) and the browser's ICU (client),
// which causes a hydration mismatch. A fixed manual format avoids that.
function formatLeke(n: number): string {
  return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " L";
}

function severityColor(score: number): string {
  if (score >= 75) return "#f87171";
  if (score >= 50) return "#fbbf24";
  return "#4ade80";
}

export default function CommandCenterClient({ data }: { data: CommandCenterData }) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div className="absolute inset-0">
        <CityMap />
      </div>

      {/* HUD overlay: pointer-events-none on the wrapper so the 3D map stays
          interactive in the empty center; each panel re-enables pointer
          events for itself. */}
      <div className="absolute inset-0 pointer-events-none flex flex-col">
        <header className="pointer-events-auto m-3 mb-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[rgba(11,15,21,0.88)] px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-sm font-semibold tracking-wide text-white">Elbasan Command Center</h1>
          </div>
          <div className="flex items-center gap-5 text-[11px] text-white/70">
            <span>
              <span className="text-white font-semibold">{data.city.totalRequests}</span> kërkesa gjithsej
            </span>
            <span>
              <span className="text-emerald-400 font-semibold">{data.city.resolvedPct}%</span> të zgjidhura
            </span>
            <span>
              <span className="text-red-400 font-semibold">{data.city.openCount}</span> në pritje
            </span>
            <span>
              Buxheti: <span className="text-white font-semibold">{formatLeke(data.city.totalSpentLeke)}</span>{" "}
              / {formatLeke(data.city.totalBudgetLeke)}
            </span>
          </div>
        </header>

        <div className="flex-1 flex gap-3 p-3 min-h-0">
          <aside className="pointer-events-auto w-[260px] flex flex-col gap-3 min-h-0">
            <div className="rounded-xl border border-white/10 bg-[rgba(11,15,21,0.88)] p-3 max-h-[280px] overflow-y-auto">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">Zonat</h3>
              <div className="space-y-1.5">
                {data.zones.map((z) => (
                  <button
                    key={z.zoneId}
                    onClick={() => setSelectedZone(selectedZone === z.zoneId ? null : z.zoneId)}
                    className={`w-full text-left rounded-lg border px-2.5 py-2 text-[11px] transition ${
                      selectedZone === z.zoneId
                        ? "border-sky-400/60 bg-sky-400/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white/90">{z.zoneLabel}</span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: severityColor(z.severityScore) }}
                      >
                        {z.severityScore}
                      </span>
                    </div>
                    <div className="text-white/40 mt-0.5">
                      {z.total} kërkesa · {z.open + z.inProgress} aktive
                      {z.budget ? ` · buxheti ${z.budget.spentPct}%` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[rgba(11,15,21,0.88)] p-3 flex-1 min-h-0 overflow-y-auto">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">Sinjalizime</h3>
              <div className="space-y-1.5">
                {data.alerts.length === 0 && (
                  <p className="text-[11px] text-white/30 italic">Asnjë sinjalizim.</p>
                )}
                {data.alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border px-2.5 py-2 text-[11px] leading-snug ${
                      a.severity === "critical"
                        ? "border-red-400/30 bg-red-400/[0.07] text-red-200"
                        : "border-amber-400/30 bg-amber-400/[0.07] text-amber-200"
                    }`}
                  >
                    {a.message}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex-1" />

          <aside className="pointer-events-auto w-[300px] flex flex-col gap-3 min-h-0">
            <div className="rounded-xl border border-white/10 bg-[rgba(11,15,21,0.88)] p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">
                Trendi mujor
              </h3>
              <TrendChart data={data.trend} />
            </div>
            <div className="rounded-xl border border-white/10 bg-[rgba(11,15,21,0.88)] p-3 flex-1 min-h-0">
              <EvidencePanel records={data.records} selectedZone={selectedZone} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
