import type { TrendPoint } from "@/lib/commandCenter/aggregate";

import { monthName } from "@/lib/commandCenter/months";

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        Nuk ka të dhëna të mjaftueshme.
      </p>
    );
  }

  const width = 280;
  const height = 78;
  // Inset so the first/last month names (now full-length) aren't clipped at the edges.
  const padX = 20;
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: data.length > 1 ? padX + i * stepX : width / 2,
    y: height - (d.count / max) * height,
    month: d.month,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  // Real computed takeaway, not a caption written by hand -- the actual
  // busiest month in the data.
  const peak = data.reduce((best, d) => (d.count > best.count ? d : best), data[0]);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full h-[110px]" role="img" aria-label="Kërkesat sipas muajit">
        <path d={area} style={{ fill: "var(--bc-forest)", opacity: 0.12 }} />
        <path d={line} style={{ fill: "none", stroke: "var(--bc-forest)", strokeWidth: 2 }} />
        {points.map((p) => (
          <circle key={p.month} cx={p.x} cy={p.y} r={2.5} style={{ fill: "var(--bc-forest)" }} />
        ))}
        {points.map((p) => (
          <text key={p.month} x={p.x} y={height + 12} textAnchor="middle" fontSize="7" style={{ fill: "var(--bc-text-secondary)" }}>
            {monthName(p.month)}
          </text>
        ))}
      </svg>
      <div className="mt-1 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        Muaji me më shumë aktivitet:{" "}
        <span style={{ color: "var(--bc-forest)", fontWeight: 600 }}>{monthName(peak.month, true)}</span>
      </div>
    </div>
  );
}
