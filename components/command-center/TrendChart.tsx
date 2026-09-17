import type { TrendPoint } from "@/lib/commandCenter/aggregate";

const MONTH_LABELS = [
  "Jan", "Shk", "Mar", "Pri", "Maj", "Qer", "Kor", "Gus", "Sht", "Tet", "Nën", "Dhj",
];

function formatMonth(month: string): string {
  const [, m] = month.split("-");
  return MONTH_LABELS[Number(m) - 1] ?? month;
}

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-white/40">Nuk ka të dhëna të mjaftueshme.</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 280;
  const height = 90;
  const barGap = 6;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full h-[106px]" role="img" aria-label="Kërkesat sipas muajit">
      {data.map((d, i) => {
        const barHeight = (d.count / max) * height;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <g key={d.month}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill="rgb(56,189,248)"
              fillOpacity={0.85}
            />
            <text
              x={x + barWidth / 2}
              y={height + 12}
              textAnchor="middle"
              fontSize="8"
              fill="rgba(255,255,255,0.5)"
            >
              {formatMonth(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
