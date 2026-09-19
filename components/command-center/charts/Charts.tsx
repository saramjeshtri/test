"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/commandCenter/labels";
import type { TrendPoint, ZoneStats } from "@/lib/commandCenter/aggregate";
import { monthName } from "@/lib/commandCenter/months";

/* ------------------------------------------------------------------ */
/* Card with a chart <-> table switch: the table is the accessible twin */
/* of every chart, and tooltips never gate a value.                     */
/* ------------------------------------------------------------------ */

export function ChartCard({
  id,
  title,
  subtitle,
  table,
  children,
  className = "",
  legend,
}: {
  /** Anchor for the header search's "go to this chart". */
  id?: string;
  title: string;
  subtitle?: string;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
  legend?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section
      id={id}
      className={`bc-rise bc-anchor scroll-mt-2 rounded-[14px] border flex flex-col ${className}`}
      style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>{subtitle}</p>}
        </div>
        <div className="bc-seg-track flex shrink-0" role="group" aria-label="Pamja">
          {(
            [
              ["chart", "Grafik", BarChart3],
              ["table", "Tabelë", Table2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              aria-label={`Pamja si ${label.toLowerCase()}`}
              className={`bc-press flex items-center gap-1.5 px-2.5 h-7 rounded-[9px] text-[11px] font-semibold ${view === id ? "bc-seg-pill" : ""}`}
              style={view === id ? undefined : { color: "var(--bc-text-secondary)" }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </header>
      {legend && view === "chart" && <div className="px-4 pb-1">{legend}</div>}
      <div className="px-4 pb-4 pt-1 flex-1">
        {view === "chart" ? (
          children
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ color: "var(--bc-text)" }}>
              <thead>
                <tr style={{ color: "var(--bc-text-secondary)" }}>
                  {table.head.map((h, i) => (
                    <th key={h} className={`py-1.5 text-[10.5px] font-semibold tracking-[0.06em] ${i === 0 ? "text-left" : "text-right"}`}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t" style={{ borderColor: "var(--bc-border)" }}>
                    {row.map((cell, i) => (
                      <td key={i} className={`py-1.5 ${i === 0 ? "text-left" : "text-right bc-mono"}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------- tooltip ---------------------------- */

type Tip = { x: number; y: number; node: ReactNode } | null;

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const showAt = (clientX: number, clientY: number, node: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: clientX - box.left, y: clientY - box.top, node });
  };
  const hide = () => setTip(null);
  const view = (
    <>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 rounded-[10px] border px-2.5 py-1.5 text-[11.5px] leading-snug whitespace-nowrap"
          style={{
            left: tip.x,
            top: tip.y,
            transform: "translate(-50%, calc(-100% - 10px))",
            borderColor: "var(--bc-border)",
            background: "var(--bc-surface)",
            color: "var(--bc-text)",
            boxShadow: "var(--bc-shadow-float)",
          }}
        >
          {tip.node}
        </div>
      )}
    </>
  );
  return { ref, showAt, hide, view };
}

/** Full month name with year ("Mars 2026") for tooltips, tables and stats. */
export function monthLabel(m: string): string {
  return monthName(m, true);
}

/** Round axis: a step of 1, 2, 5, 10... so ticks land on clean numbers (0 / 5 / 10 / 15). */
function niceAxis(maxValue: number, divisions = 4): { max: number; ticks: number[] } {
  const raw = Math.max(maxValue, 1) / divisions;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= raw) ?? raw;
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  return { max, ticks };
}

/** Width of an element, tracked so SVG text renders at its real size instead of scaling with the card. */
function useWidth(ref: React.RefObject<HTMLElement | null>, fallback: number) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* ---------------------------- line / area ---------------------------- */

export function TrendLine({ data }: { data: TrendPoint[] }) {
  const { ref, showAt, hide, view } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const W = useWidth(ref, 640);
  const H = 240, L = 34, R = 28, T = 20, B = 28;
  const { max, ticks } = niceAxis(Math.max(...data.map((d) => d.count), 1));
  const x = (i: number) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.count)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = data[data.length - 1];
  // Full month names are wide: on a narrow card show every other one rather than overlap.
  const labelEvery = data.length > 1 && (W - L - R) / (data.length - 1) < 58 ? 2 : 1;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
    const svgBox = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    showAt(svgBox.left + (x(best) / W) * svgBox.width, svgBox.top + (y(data[best].count) / H) * svgBox.height, (
      <>
        <div className="font-semibold">{monthLabel(data[best].month)}</div>
        <div style={{ color: "var(--bc-text-secondary)" }}>{data[best].count} kërkesa</div>
      </>
    ));
  }

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Kërkesat sipas muajit">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--bc-border)" strokeWidth="1" />
            <text x={L - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--bc-text-secondary)" className="bc-mono">{Math.round(t)}</text>
          </g>
        ))}
        <path d={area} fill="var(--bc-forest)" opacity="0.1" />
        <path d={line} fill="none" stroke="var(--bc-forest)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--bc-text-secondary)" strokeWidth="1" opacity="0.5" />}
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.count)} r={hover === i ? 5.5 : 4} fill="var(--bc-forest)" stroke="var(--bc-surface)" strokeWidth="2" />
            {(i % labelEvery === 0) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--bc-text-secondary)">{monthName(d.month)}</text>
            )}
          </g>
        ))}
        {/* endpoint direct label */}
        <text x={x(data.length - 1)} y={y(last.count) - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--bc-text)" className="bc-mono">{last.count}</text>
        {/* hover layer: wider than the marks */}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide(); }} />
      </svg>
      {view}
    </div>
  );
}

/* ---------------------------- single-series bars ---------------------------- */

export function BarList({ rows, unit = "kërkesa" }: { rows: { label: string; value: number }[]; unit?: string }) {
  const { ref, showAt, hide, view } = useTip();
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <div ref={ref} className="relative flex flex-col gap-2.5" onPointerLeave={hide}>
      {rows.map((r) => {
        const tipNode = (
          <>
            <div className="font-semibold">{r.label}</div>
            <div style={{ color: "var(--bc-text-secondary)" }}>{r.value} {unit} · {Math.round((r.value / total) * 100)}%</div>
          </>
        );
        return (
          <div
            key={r.label}
            tabIndex={0}
            className="grid grid-cols-[156px_1fr] items-center gap-3 rounded-[8px] outline-none focus-visible:bg-[var(--bc-panel-hover)] hover:bg-[var(--bc-panel-hover)] transition-colors duration-150 -mx-1.5 px-1.5 py-0.5"
            onPointerMove={(e) => showAt(e.clientX, e.clientY - 4, tipNode)}
            onFocus={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              showAt(b.left + b.width / 2, b.top, tipNode);
            }}
            onBlur={hide}
          >
            <span className="text-[12px] truncate" style={{ color: "var(--bc-text)" }}>{r.label}</span>
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-3.5 rounded-r-[4px]" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, maxWidth: "calc(100% - 28px)", background: "var(--bc-forest)" }} />
              <span className="bc-mono text-[11.5px] font-semibold" style={{ color: "var(--bc-text)" }}>{r.value}</span>
            </div>
          </div>
        );
      })}
      {view}
    </div>
  );
}

/* ---------------------------- stacked status by zone ---------------------------- */

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {STATUS_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--bc-text)" }}>
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: STATUS_COLOR[s] }} />
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

export function StatusByZone({ zones }: { zones: ZoneStats[] }) {
  const { ref, showAt, hide, view } = useTip();
  const max = Math.max(...zones.map((z) => z.total), 1);
  return (
    <div ref={ref} className="relative flex flex-col gap-2.5" onPointerLeave={hide}>
      {zones.map((z) => {
        const parts = [
          { s: "resolved" as const, n: z.resolved },
          { s: "in_progress" as const, n: z.inProgress },
          { s: "open" as const, n: z.open },
        ];
        const tipNode = (
          <>
            <div className="font-semibold">{z.zoneLabel} · {z.total} kërkesa</div>
            {parts.map((p) => (
              <div key={p.s} className="flex items-center gap-1.5" style={{ color: "var(--bc-text-secondary)" }}>
                <span className="w-2 h-2 rounded-[2px]" style={{ background: STATUS_COLOR[p.s] }} />
                {STATUS_LABEL[p.s]} <span className="bc-mono ml-auto pl-3" style={{ color: "var(--bc-text)" }}>{p.n}</span>
              </div>
            ))}
          </>
        );
        return (
          <div
            key={z.zoneId}
            tabIndex={0}
            className="grid grid-cols-[56px_1fr] items-center gap-3 rounded-[8px] outline-none focus-visible:bg-[var(--bc-panel-hover)] hover:bg-[var(--bc-panel-hover)] transition-colors duration-150 -mx-1.5 px-1.5 py-0.5"
            onPointerMove={(e) => showAt(e.clientX, e.clientY - 4, tipNode)}
            onFocus={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              showAt(b.left + b.width / 2, b.top, tipNode);
            }}
            onBlur={hide}
          >
            <span className="text-[12px]" style={{ color: "var(--bc-text)" }}>{z.zoneLabel}</span>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex gap-[2px] h-4" style={{ width: `${(z.total / max) * 100}%`, maxWidth: "calc(100% - 28px)" }}>
                {parts.filter((p) => p.n > 0).map((p, i, arr) => (
                  <div
                    key={p.s}
                    className={i === arr.length - 1 ? "rounded-r-[4px]" : ""}
                    style={{ flex: p.n, background: STATUS_COLOR[p.s] }}
                  />
                ))}
              </div>
              <span className="bc-mono text-[11.5px] font-semibold" style={{ color: "var(--bc-text)" }}>{z.total}</span>
            </div>
          </div>
        );
      })}
      {view}
    </div>
  );
}

/* ---------------------------- budget meters ---------------------------- */

function budgetColor(pct: number): string {
  if (pct >= 85) return "var(--bc-st-open)";
  if (pct >= 60) return "var(--bc-st-progress)";
  return "var(--bc-st-resolved)";
}

export function BudgetMeters({ zones }: { zones: ZoneStats[] }) {
  const { ref, showAt, hide, view } = useTip();
  const mln = (n: number) => `${(n / 1_000_000).toFixed(1)} mln L`;
  return (
    <div ref={ref} className="relative flex flex-col gap-3" onPointerLeave={hide}>
      {zones.filter((z) => z.budget).map((z) => {
        const b = z.budget!;
        const tipNode = (
          <>
            <div className="font-semibold">{z.zoneLabel}</div>
            <div style={{ color: "var(--bc-text-secondary)" }}>{mln(b.spentLeke)} nga {mln(b.allocatedLeke)}</div>
          </>
        );
        return (
          <div
            key={z.zoneId}
            tabIndex={0}
            className="grid grid-cols-[56px_1fr_44px] items-center gap-3 rounded-[8px] outline-none focus-visible:bg-[var(--bc-panel-hover)] hover:bg-[var(--bc-panel-hover)] transition-colors duration-150 -mx-1.5 px-1.5 py-0.5"
            onPointerMove={(e) => showAt(e.clientX, e.clientY - 4, tipNode)}
            onFocus={(e) => {
              const bx = e.currentTarget.getBoundingClientRect();
              showAt(bx.left + bx.width / 2, bx.top, tipNode);
            }}
            onBlur={hide}
          >
            <span className="text-[12px]" style={{ color: "var(--bc-text)" }}>{z.zoneLabel}</span>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bc-surface-2)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(b.spentPct, 100)}%`, background: budgetColor(b.spentPct) }} />
            </div>
            <span className="bc-mono text-[11.5px] font-semibold text-right" style={{ color: "var(--bc-text)" }}>{b.spentPct}%</span>
          </div>
        );
      })}
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        {[["< 60%", "var(--bc-st-resolved)"], ["60–85%", "var(--bc-st-progress)"], ["> 85%", "var(--bc-st-open)"]].map(([l, c]) => (
          <li key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{l} e buxhetit</li>
        ))}
      </ul>
      {view}
    </div>
  );
}
