"use client";

import { useEffect, useRef, useState } from "react";
import type { TrendPoint } from "@/lib/commandCenter/aggregate";
import { monthName } from "@/lib/commandCenter/months";

/** Size of an element, tracked so the chart is drawn at its real size (crisp text) and can
 *  grow to fill whatever height the panel has left instead of leaving a gap below it. */
function useBox(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 300, h: 112 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.max(240, Math.round(width)), h: Math.max(104, Math.round(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export default function TrendChart({
  data,
  reference,
}: {
  data: TrendPoint[];
  /** A dashed yardstick line (e.g. the average zone) drawn under the main one. */
  reference?: TrendPoint[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { w: W, h: H } = useBox(ref);

  if (data.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        Nuk ka të dhëna të mjaftueshme.
      </p>
    );
  }

  const L = 28, R = 14, T = 24, B = 24;
  const peak = data.reduce((best, d) => (d.count > best.count ? d : best), data[0]);
  const refMax = reference ? Math.max(...reference.map((d) => d.count)) : 0;
  const top = Math.max(2, Math.ceil(Math.max(peak.count, refMax) / 2) * 2);
  const ticks = [0, top / 2, top];
  const x = (i: number) => (data.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const refLine = reference?.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const labelEvery = data.length > 1 && (W - L - R) / (data.length - 1) < 52 ? 2 : 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={ref} className="flex-1 min-h-[104px]">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Kërkesat sipas muajit">
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bc-forest)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--bc-forest)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--bc-border)" strokeWidth="1" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={L - 8} y={y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--bc-text-secondary)" className="bc-mono">{t}</text>
            </g>
          ))}
          {refLine && <path d={refLine} fill="none" stroke="var(--bc-text-secondary)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" />}
          <path d={area} fill="url(#trend-fill)" className="bc-slide" style={{ animationDelay: "350ms" }} />
          <path d={line} pathLength={1} fill="none" stroke="var(--bc-forest)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" className="bc-draw" />
          {data.map((d, i) => {
            const isPeak = d.month === peak.month;
            return (
              <g key={d.month} className="bc-slide" style={{ animationDelay: `${300 + i * 60}ms` }}>
                {isPeak && <circle cx={x(i)} cy={y(d.count)} r="9" fill="var(--bc-forest)" opacity="0.18" />}
                <circle cx={x(i)} cy={y(d.count)} r={isPeak ? 4.5 : 3.25} fill="var(--bc-forest)" stroke="var(--bc-surface)" strokeWidth="2" />
                {(d.count > 0 || isPeak) && (
                <text
                  x={x(i)}
                  y={y(d.count) - (isPeak ? 14 : 10)}
                  textAnchor="middle"
                  fontSize={isPeak ? 12 : 10.5}
                  fontWeight={isPeak ? 700 : 500}
                  fill={isPeak ? "var(--bc-forest)" : "var(--bc-text)"}
                  className="bc-mono"
                >
                  {d.count}
                </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="9.5" fill="var(--bc-text-secondary)">
                    {monthName(d.month)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {!reference && (
        /* Real computed takeaway, not a caption written by hand -- the actual busiest month in the data. */
        <div className="mt-2 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
          Muaji me më shumë aktivitet:{" "}
          <span style={{ color: "var(--bc-forest)", fontWeight: 600 }}>{monthName(peak.month, true)}</span>
          <span> · {peak.count} kërkesa</span>
        </div>
      )}
    </div>
  );
}
