import { Inbox, CheckCircle2, Clock, Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/commandCenter/labels";
import { monthName } from "@/lib/commandCenter/months";

/** Change vs the previous month, as a real request count from the trend data --
 *  null (shown as nothing) when there aren't two months to compare. */
function monthOverMonthChange(trend: CommandCenterData["trend"]): { diff: number; prevMonth: string } | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  return { diff: last.count - prev.count, prevMonth: prev.month };
}

function Kpi({
  icon,
  tone,
  label,
  value,
  context,
  aside,
  index,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  context?: ReactNode;
  aside?: ReactNode;
  index: number;
}) {
  return (
    <div
      className="bc-rise flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3.5"
      style={{
        borderColor: "var(--bc-border)",
        background: "var(--bc-surface)",
        boxShadow: "var(--bc-shadow)",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>
          <span
            className="grid place-items-center w-6 h-6 rounded-[8px] shrink-0"
            style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
          >
            {icon}
          </span>
          {label}
        </div>
        <div className="bc-mono mt-2 text-[32px] font-bold leading-none tracking-tight" style={{ color: tone }}>
          {value}
        </div>
        {context && (
          <div className="mt-1.5 text-[11px] truncate" style={{ color: "var(--bc-text-secondary)" }}>
            {context}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}

/** Every card here counts requests, so the four numbers read as one set. Shares
 *  of the total live in the small line underneath, always spelled out in words. */
export default function KpiStrip({ data }: { data: CommandCenterData }) {
  const change = monthOverMonthChange(data.trend);
  const total = data.records.length;
  const count = (status: "resolved" | "in_progress" | "open") => data.records.filter((r) => r.status === status).length;
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}% e të gjitha kërkesave` : undefined);
  const resolved = count("resolved");
  const inProgress = count("in_progress");
  const open = count("open");

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
      <Kpi
        index={0}
        icon={<Inbox size={13} />}
        tone="var(--bc-text)"
        label="KËRKESA GJITHSEJ"
        value={String(total)}
        context={
          change && change.diff !== 0 ? (
            <span style={{ color: change.diff > 0 ? "var(--bc-critical)" : "var(--bc-forest)" }}>
              {change.diff > 0 ? "↑" : "↓"} {Math.abs(change.diff)} {change.diff > 0 ? "më shumë" : "më pak"} se në {monthName(change.prevMonth)}
            </span>
          ) : (
            "nga të gjitha sistemet"
          )
        }
      />
      <Kpi
        index={1}
        icon={<CheckCircle2 size={13} />}
        tone={STATUS_COLOR.resolved}
        label={STATUS_LABEL.resolved.toUpperCase()}
        value={String(resolved)}
        context={share(resolved)}
      />
      <Kpi
        index={2}
        icon={<Clock size={13} />}
        tone={STATUS_COLOR.in_progress}
        label={STATUS_LABEL.in_progress.toUpperCase()}
        value={String(inProgress)}
        context={share(inProgress)}
      />
      <Kpi
        index={3}
        icon={<Hourglass size={13} />}
        tone={STATUS_COLOR.open}
        label={STATUS_LABEL.open.toUpperCase()}
        value={String(open)}
        context={share(open)}
      />
    </div>
  );
}
