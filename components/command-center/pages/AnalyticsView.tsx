"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import { severityDomain, severityToColor } from "@/lib/commandCenter/severityColor";
import { CATEGORY_LABEL, PRIORITY_LABEL, formatLeke } from "@/lib/commandCenter/labels";
import { ChartCard, TrendLine, BarList, StatusByZone, StatusLegend, BudgetMeters, monthLabel } from "../charts/Charts";
import { focusSection } from "@/lib/commandCenter/uiEvents";
import PageHeader from "./PageHeader";

function Stat({ label, value, note, index }: { label: string; value: string; note?: string; index: number }) {
  return (
    <div
      className="bc-rise rounded-[14px] border px-4 py-3.5"
      style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)", animationDelay: `${index * 50}ms` }}
    >
      <div className="text-[10.5px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>{label}</div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight" style={{ color: "var(--bc-text)" }}>{value}</div>
      {note && <div className="mt-1.5 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>{note}</div>}
    </div>
  );
}

export default function AnalyticsView({ data, focus }: { data: CommandCenterData; focus?: string }) {
  const { records, zones, trend } = data;

  // Arriving from the header search with ?focus=<section>: scroll to it once the page has laid out.
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => focusSection(focus), 250);
    return () => window.clearTimeout(t);
  }, [focus]);

  const byCategory = Object.entries(
    records.reduce<Record<string, number>>((acc, r) => {
      if (r.category) acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([k, v]) => ({ label: CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL], value: v }))
    .sort((a, b) => b.value - a.value);

  const priorityOrder = ["high", "medium", "low"] as const;
  const byPriority = priorityOrder.map((p) => ({ label: PRIORITY_LABEL[p], value: records.filter((r) => r.priority === p).length }));
  const noPriority = records.filter((r) => !r.priority).length;

  const unresolved = records.filter((r) => r.status !== "resolved");
  const unresolvedCost = unresolved.reduce((a, r) => a + (r.cost_estimate_leke ?? 0), 0);
  const costKnown = records.filter((r) => r.cost_estimate_leke !== null).length;
  const peak = [...trend].sort((a, b) => b.count - a.count)[0];

  const ranked = [...zones].sort((a, b) => b.severityScore - a.severityScore);
  const domain = severityDomain(zones.map((z) => z.severityScore));

  return (
    <>
      <PageHeader
        title="Analitika"
        description="Si ndryshojnë kërkesat me kalimin e kohës, ku grumbullohen dhe sa buxhet është përdorur. Çdo grafik ka një pamje si tabelë me të njëjtat vlera."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat index={0} label="KËRKESA GJITHSEJ" value={String(records.length)} note="nga 4 sisteme të bashkuara" />
        <Stat index={1} label="KOSTO E PAZGJIDHURAVE" value={formatLeke(unresolvedCost)} note={`vlerësim për ${unresolved.filter((r) => r.cost_estimate_leke !== null).length} nga ${unresolved.length} kërkesa`} />
        <Stat index={2} label="MUAJI ME SHUMË KËRKESA" value={peak ? monthLabel(peak.month) : "—"} note={peak ? `${peak.count} kërkesa` : undefined} />
        <Stat index={3} label="KOSTOJA E NJOHUR" value={`${costKnown}/${records.length}`} note="kërkesa kanë vlerësim kostoje" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          id="monthly"
          title="Kërkesat sipas muajit"
          subtitle="Numri i kërkesave të reja të regjistruara çdo muaj"
          table={{ head: ["Muaji", "Kërkesa"], rows: trend.map((t) => [monthLabel(t.month), t.count]) }}
        >
          <TrendLine data={trend} />
        </ChartCard>

        <ChartCard
          id="category"
          title="Kërkesat sipas kategorisë"
          subtitle="Çfarë ankohen më shumë qytetarët"
          table={{ head: ["Kategoria", "Kërkesa"], rows: byCategory.map((r) => [r.label, r.value]) }}
        >
          <BarList rows={byCategory} />
        </ChartCard>

        <ChartCard
          id="status"
          title="Statusi sipas zonës"
          subtitle="Sa është zgjidhur, sa është në proces dhe sa pret"
          legend={<StatusLegend />}
          table={{ head: ["Zona", "Zgjidhur", "Në proces", "Në pritje"], rows: zones.map((z) => [z.zoneLabel, z.resolved, z.inProgress, z.open]) }}
        >
          <StatusByZone zones={zones} />
        </ChartCard>

        <ChartCard
          id="budget"
          title="Buxheti i shpenzuar sipas zonës"
          subtitle="Përqindja e buxhetit vjetor të përdorur deri tani"
          table={{ head: ["Zona", "E shpenzuar", "E alokuar", "%"], rows: zones.filter((z) => z.budget).map((z) => [z.zoneLabel, formatLeke(z.budget!.spentLeke), formatLeke(z.budget!.allocatedLeke), `${z.budget!.spentPct}%`]) }}
        >
          <BudgetMeters zones={zones} />
        </ChartCard>

        <ChartCard
          id="priority"
          title="Kërkesat sipas prioritetit"
          subtitle={noPriority > 0 ? `${noPriority} kërkesa nuk kanë prioritet: burimi i tyre nuk e ndjek këtë fushë` : undefined}
          table={{ head: ["Prioriteti", "Kërkesa"], rows: [...byPriority.map((r) => [r.label, r.value]), ["Pa të dhëna", noPriority]] }}
        >
          <BarList rows={byPriority} />
        </ChartCard>

        <section
          id="risk"
          className="bc-rise bc-anchor scroll-mt-2 lg:col-span-2 rounded-[14px] border overflow-hidden"
          style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
        >
          <header className="px-4 pt-3.5 pb-3 border-b" style={{ borderColor: "var(--bc-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>Renditja e zonave sipas rrezikut</h2>
            <p className="mt-0.5 text-[11.5px] max-w-[80ch]" style={{ color: "var(--bc-text-secondary)" }}>
              Rezultati është një formulë e thjeshtë e shpjegueshme, jo parashikim: 60% peshë te sa e ngarkesës është ende e hapur ose në proces, dhe 40% te sa nga buxheti është shpenzuar.
            </p>
          </header>
          <table className="w-full text-[12px]" style={{ color: "var(--bc-text)" }}>
            <thead style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}>
              <tr>
                {["ZONA", "KËRKESA", "TË PAZGJIDHURA", "BUXHETI I SHPENZUAR", "REZULTATI", ""].map((h, i) => (
                  <th key={h + i} className={`px-4 py-2.5 text-[10.5px] font-semibold tracking-[0.06em] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((z) => (
                <tr key={z.zoneId} className="border-t" style={{ borderColor: "var(--bc-border)" }}>
                  <td className="px-4 py-2.5 font-medium">{z.zoneLabel}</td>
                  <td className="px-4 py-2.5 text-right bc-mono">{z.total}</td>
                  <td className="px-4 py-2.5 text-right bc-mono">{z.open + z.inProgress}</td>
                  <td className="px-4 py-2.5 text-right bc-mono">{z.budget ? `${z.budget.spentPct}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="bc-mono inline-block min-w-9 text-center text-[11.5px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `color-mix(in srgb, ${severityToColor(z.severityScore, domain)} 16%, transparent)`, color: "var(--bc-text)" }}
                    >
                      {z.severityScore}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/command-center?zone=${z.zoneId}`} className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--bc-forest)" }}>
                      Hartë <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
