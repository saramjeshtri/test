"use client";

import { useState } from "react";
import { ListChecks, Download, RotateCcw, ChevronDown } from "lucide-react";
import { STEP_LEKE, planToCsv, type Plan } from "@/lib/commandCenter/plan";
import { CATEGORY_LABEL, formatLeke } from "@/lib/commandCenter/labels";
import Panel from "./Panel";

const SHOWN = 5;

/**
 * Work plan: enter this month's budget and get what to fix first, how much each zone needs, and a
 * downloadable list. While this tab is open the zone list, the top cards and the map show the
 * city as it would look once the plan is done.
 */
export default function PlannerPanel({
  budget,
  max,
  plan,
  selectedZone,
  onBudget,
  onSelectZone,
}: {
  budget: number;
  max: number;
  plan: Plan;
  selectedZone: string | null;
  onBudget: (leke: number) => void;
  onSelectZone: (zoneId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const [how, setHow] = useState(false);
  const fill = max > 0 ? (budget / max) * 100 : 0;
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.ceil(n / STEP_LEKE) * STEP_LEKE));
  const shown = all ? plan.funded : plan.funded.slice(0, SHOWN);
  const biggest = plan.zones[0]?.amountLeke || 1;
  const urgentGap = Math.max(0, plan.urgentNeedLeke - plan.fundedLeke);

  function download() {
    const url = URL.createObjectURL(new Blob([planToCsv(plan)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plani-i-veprimit-busulla.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const chip = "bc-press text-[11px] font-semibold px-2.5 py-1 rounded-full border";
  const chips: [string, number][] = [
    ["500 mijë", 500_000],
    ["1 mln", 1_000_000],
    ["2 mln", 2_000_000],
    ["Urgjentet", plan.urgentNeedLeke],
  ];

  return (
    <Panel
      title="Plani i veprimit"
      icon={<ListChecks size={14} style={{ color: "var(--bc-forest)" }} />}
      className="flex-1 min-h-0"
      bodyClassName="overflow-y-auto"
      rise={false}
      right={
        <button
          onClick={() => onBudget(0)}
          aria-label="Pastro planin"
          title="Pastro"
          className="bc-press grid place-items-center w-6 h-6 rounded-full hover:bg-[var(--bc-panel-hover)]"
          style={{ color: "var(--bc-text-secondary)" }}
        >
          <RotateCcw size={12} />
        </button>
      }
    >
      <div className="text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>Buxheti i muajit</div>
      <div className="bc-mono mt-1 text-[26px] font-bold leading-none whitespace-nowrap" style={{ color: "var(--bc-text)" }}>
        {formatLeke(budget)}
      </div>
      <input
        type="range"
        className="bc-range mt-3"
        min={0}
        max={max}
        step={STEP_LEKE}
        value={Math.min(budget, max)}
        onChange={(e) => onBudget(Number(e.target.value))}
        aria-label="Buxheti i muajit"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map(([label, value]) => (
          <button
            key={label}
            onClick={() => onBudget(clamp(value))}
            className={chip}
            style={{ borderColor: "var(--bc-border)", color: "var(--bc-text-secondary)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {plan.funded.length === 0 ? (
        <p className="mt-4 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
          Vendos një buxhet dhe merr planin: çfarë të rregullohet së pari dhe sa i duhet secilës zonë.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              [String(plan.funded.length), "kërkesa"],
              [String(plan.zones.length), "zona"],
              [`${plan.cityPendingBefore}→${plan.cityPendingAfter}`, "të pazgjidhura"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[10px] px-2.5 py-2" style={{ background: "var(--bc-surface-2)" }}>
                <div className="bc-mono text-[15px] font-bold leading-none" style={{ color: "var(--bc-text)" }}>{v}</div>
                <div className="mt-1 text-[10px]" style={{ color: "var(--bc-text-secondary)" }}>{l}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-[10px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>BUXHETI SIPAS ZONËS</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {plan.zones.map((z) => (
              <button
                key={z.zoneId}
                onClick={() => onSelectZone(z.zoneId)}
                className="bc-press text-left rounded-[10px] px-2.5 py-2 transition-colors hover:bg-[var(--bc-panel-hover)]"
                style={{ background: selectedZone === z.zoneId ? "var(--bc-panel-active)" : undefined }}
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold" style={{ color: "var(--bc-text)" }}>{z.zoneLabel}</span>
                  <span className="bc-mono font-semibold" style={{ color: "var(--bc-text)" }}>{formatLeke(z.amountLeke)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bc-surface-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(z.amountLeke / biggest) * 100}%`, background: "var(--bc-forest)", transition: "width 240ms var(--ease-out)" }} />
                </div>
                <div className="mt-1 text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                  {z.requests} {z.requests === 1 ? "kërkesë" : "kërkesa"} · rreziku {z.riskBefore}→<span style={{ color: "var(--bc-st-resolved)", fontWeight: 600 }}>{z.riskAfter}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 text-[10px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>RADHA E PUNËS</div>
          <ol className="mt-2 flex flex-col">
            {shown.map((it, i) => (
              <li
                key={`${it.record.source_system}-${it.record.source_row_ref}`}
                className="flex items-start gap-2.5 py-2"
                style={{ borderTop: i ? "1px solid var(--bc-border)" : undefined }}
              >
                <span className="bc-mono grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0" style={{ background: "var(--bc-forest-tint)", color: "var(--bc-forest)" }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-semibold truncate" style={{ color: "var(--bc-text)" }}>
                      {it.zoneLabel} · {it.record.category ? CATEGORY_LABEL[it.record.category] : "Kërkesë"}
                    </span>
                    <span className="bc-mono shrink-0" style={{ color: "var(--bc-text-secondary)" }}>
                      {it.estimated ? "≈ " : ""}{formatLeke(it.cost)}
                    </span>
                  </div>
                  {it.why.length > 0 && (
                    <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>{it.why.join(" · ")}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {plan.funded.length > SHOWN && (
            <button onClick={() => setAll((a) => !a)} className="bc-press mt-1 text-[11px] font-semibold" style={{ color: "var(--bc-forest)" }}>
              {all ? "Shfaq më pak" : `Shfaq të gjitha (${plan.funded.length})`}
            </button>
          )}

          <div className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--bc-text-secondary)" }}>
            {plan.unfunded.length > 0 && (
              <>Pa buxhet mbeten <strong style={{ color: "var(--bc-text)" }}>{plan.unfunded.length} kërkesa</strong> (≈ {formatLeke(plan.unfundedLeke)}). </>
            )}
            {urgentGap > 0
              ? <>Për të gjitha urgjentet duhen edhe <strong style={{ color: "var(--bc-text)" }}>{formatLeke(urgentGap)}</strong>.</>
              : <>Të gjitha urgjentet janë të mbuluara.</>}
          </div>

          <button
            onClick={download}
            className="bc-press mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-full"
            style={{ color: "var(--bc-forest)", background: "var(--bc-forest-tint)" }}
          >
            <Download size={13} /> Shkarko planin (CSV)
          </button>
        </>
      )}

      <div>
        <button
          onClick={() => setHow((h) => !h)}
          aria-expanded={how}
          className="bc-press mt-3 inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: "var(--bc-forest)" }}
        >
          Si llogaritet? <ChevronDown size={12} style={{ transform: how ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }} />
        </button>
        {how && (
          <ul className="bc-pop mt-2 flex flex-col gap-1.5 text-[11px] leading-snug" style={{ color: "var(--bc-text-secondary)" }}>
            <li>Kërkesat urgjente vijnë të parat. Pastaj radhitja bëhet sipas prioritetit, kohës në pritje dhe rrezikut të zonës.</li>
            <li>Financohet nga maja e radhës; ajo që nuk hyn në buxhetin e mbetur kalohet dhe provohet tjetra.</li>
            <li>Secila kushton vlerësimin e vet; kur burimi nuk ka, mesataren e zonës (shënuar me ≈).</li>
            <li>Shuma për zonë është kostoja e kërkesave të financuara aty; rreziku rillogaritet me formulën e panelit.</li>
            <li><strong style={{ color: "var(--bc-text)" }}>Propozim i thjeshtë për diskutim, jo vendim.</strong></li>
          </ul>
        )}
      </div>
    </Panel>
  );
}
