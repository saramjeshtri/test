"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronDown, CircleAlert, GitCompareArrows, Info, ListChecks, Map as MapIcon, Lightbulb, Wrench } from "lucide-react";
import type { Citation } from "@/lib/agent/types";
import type { StoredMessage } from "./chatStore";
import RichText from "./RichText";

const TOOL_LABEL: Record<string, string> = {
  city_overview: "Pamja e qytetit",
  zone_summary: "Përmbledhja e zonës",
  count_requests: "Numërimi i kërkesave",
  search_requests: "Kërkimi i kërkesave",
  monthly_trend: "Trendi mujor",
  budget_status: "Buxheti",
  build_work_plan: "Plani i punës",
};

/** The Busulla compass on its own (no frame); the artwork switches with the theme (see globals.css). */
export function BrandAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ height: size, width: Math.round(size * 0.83) }}>
      <Image src="/brand/busulla-logo-light.png" alt="" width={40} height={48} className="bc-logo-light h-full w-auto" />
      <Image src="/brand/busulla-logo-dark.png" alt="" width={40} height={48} className="bc-logo-dark h-full w-auto" />
    </span>
  );
}

export function UserMessage({ text, images }: { text: string; images?: string[] }) {
  return (
    <div className="flex items-start justify-end gap-2.5">
      <div
        className="max-w-[80%] rounded-[16px] rounded-tr-[5px] border px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap"
        style={{ background: "var(--bc-surface-2)", borderColor: "var(--bc-border)", color: "var(--bc-text)" }}
      >
        {images && images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- a small data URL made in the browser, nothing to optimise
              <img key={i} src={src} alt="Foto e dërguar" className="h-[72px] w-[72px] rounded-[10px] object-cover" />
            ))}
          </div>
        )}
        {text}
      </div>
      <span className="grid place-items-center w-8 h-8 rounded-full text-[11px] font-bold shrink-0" style={{ background: "var(--bc-forest)", color: "#fff" }}>
        DM
      </span>
    </div>
  );
}

export function CitationCard({ c, n }: { c: Citation; n: number }) {
  return (
    <div className="bc-pop rounded-[10px] border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)" }}>
      <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--bc-text)" }}>
        <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold" style={{ background: "var(--bc-forest-tint)", color: "var(--bc-forest)" }}>
          {n}
        </span>
        {[c.zone, c.category, c.status].filter(Boolean).join(" · ")}
      </div>
      <p className="mt-1.5" style={{ color: "var(--bc-text)" }}>{c.description ?? "Pa përshkrim"}</p>
      <p className="mt-1.5 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        {c.date ?? "pa datë"} · {c.source} · <span className="bc-mono break-all">{c.sourceRow}</span>
      </p>
    </div>
  );
}

const argsText = (args: Record<string, unknown>) =>
  Object.entries(args)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");

function Trace({ trace }: { trace: NonNullable<StoredMessage["result"]>["trace"] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="bc-press inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: "var(--bc-text-secondary)" }}
      >
        <Wrench size={11} /> Si e gjeta ({trace.length})
        <ChevronDown size={11} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }} />
      </button>
      {open && (
        <ol className="bc-pop mt-1.5 flex flex-col gap-1.5">
          {trace.map((t, i) => (
            <li key={i} className="text-[11.5px] leading-snug" style={{ color: "var(--bc-text-secondary)" }}>
              <span className="font-semibold" style={{ color: t.error ? "var(--bc-st-open)" : "var(--bc-text)" }}>{TOOL_LABEL[t.tool] ?? t.tool}</span>
              {Object.keys(t.args).length > 0 && <span className="bc-mono"> ({argsText(t.args)})</span>}
              {" → "}
              {t.summary}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AssistantMessage({ msg }: { msg: StoredMessage }) {
  const [active, setActive] = useState<string | null>(null);
  const result = msg.result;
  const citations = result?.citations ?? [];
  const shown = citations.find((c) => c.ref === active);
  const insight = result?.insight;

  return (
    <div className="flex items-start gap-2.5">
      {msg.failed ? (
        <span className="grid place-items-center w-8 h-8 rounded-full shrink-0" style={{ background: "color-mix(in srgb, var(--bc-st-open) 16%, transparent)", color: "var(--bc-st-open)" }}>
          <CircleAlert size={15} />
        </span>
      ) : (
        <BrandAvatar />
      )}
      <div
        className="min-w-0 max-w-[88%] rounded-[16px] rounded-tl-[5px] border px-4 py-3.5 text-[13.5px] leading-relaxed flex flex-col gap-3"
        style={{ background: "var(--bc-surface)", borderColor: "var(--bc-border)", color: "var(--bc-text)", boxShadow: "var(--bc-shadow)" }}
      >
        <RichText text={msg.text} citations={citations} active={active} onCite={(ref) => setActive((a) => (a === ref ? null : ref))} />

        {shown && <CitationCard c={shown} n={citations.findIndex((c) => c.ref === shown.ref) + 1} />}

        {insight && (
          <div className="flex gap-2.5 rounded-[12px] px-3.5 py-3" style={{ background: "var(--bc-forest-tint)" }}>
            <Lightbulb size={16} className="shrink-0 mt-0.5" style={{ color: "var(--bc-forest)" }} />
            <div className="text-[12.5px] leading-snug" style={{ color: "var(--bc-text-secondary)" }}>
              <div className="font-bold" style={{ color: "var(--bc-text)" }}>Insight kryesor · {insight.zone}</div>
              <p className="mt-0.5">{insight.headline}</p>
              {insight.recommendation && <p className="mt-1"><span className="font-semibold" style={{ color: "var(--bc-text)" }}>Rekomandim: </span>{insight.recommendation}.</p>}
            </div>
          </div>
        )}

        {result?.general && (
          <p className="flex gap-1.5 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
            <Info size={12} className="shrink-0 mt-0.5" /> Njohuri të përgjithshme rreth Elbasanit, jo nga të dhënat e bashkisë. Verifiko para se ta përdorësh.
          </p>
        )}
        {result?.notice && (
          <p className="flex gap-1.5 text-[11.5px]" style={{ color: "var(--bc-st-progress)" }}>
            <CircleAlert size={12} className="shrink-0 mt-0.5" /> {result.notice}
          </p>
        )}
        {result && <Trace trace={result.trace} />}
      </div>
    </div>
  );
}

/** What to do next with an answer that came from the data. */
export function ActionChips({ focusZone, onAsk }: { focusZone?: string; onAsk: (question: string) => void }) {
  const chip = "bc-press inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[12px] font-semibold transition-colors hover:bg-[var(--bc-panel-hover)]";
  const style = { borderColor: "var(--bc-border)", background: "var(--bc-surface)", color: "var(--bc-text)" };
  return (
    <div className="flex flex-wrap gap-2 pl-[42px]">
      <Link href={focusZone ? `/command-center?zone=${focusZone}` : "/command-center"} className={chip} style={style}>
        <MapIcon size={14} style={{ color: "var(--bc-forest)" }} /> Hap hartën
      </Link>
      <Link href="/command-center?tab=plan" className={chip} style={style}>
        <ListChecks size={14} style={{ color: "var(--bc-forest)" }} /> Krijo plan ndërhyrje
      </Link>
      <button onClick={() => onAsk("Sa kërkesa të pazgjidhura ka çdo zonë?")} className={chip} style={style}>
        <GitCompareArrows size={14} style={{ color: "var(--bc-forest)" }} /> Krahaso zonat <ArrowRight size={12} style={{ color: "var(--bc-text-secondary)" }} />
      </button>
    </div>
  );
}
