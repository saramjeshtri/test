"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Download, X, ArrowUpDown, MapPin } from "lucide-react";
import type { CanonicalRequest, CanonicalStatus } from "@/lib/fusion/schema";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_ORDER,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  SOURCE_SHORT,
  sourceKind,
  zoneLabel,
  describeFlag,
  formatLeke,
} from "@/lib/commandCenter/labels";
import Dropdown from "../Dropdown";
import PageHeader from "./PageHeader";

type SortKey = "date" | "zone" | "cost" | "id";

function StatusBadge({ status }: { status: CanonicalStatus | null }) {
  if (!status) return <span style={{ color: "var(--bc-text-secondary)" }}>—</span>;
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color: "var(--bc-text)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Some sources (the PDF report) carry no ID column, so the engine generated one from the file name. */
function hasRealId(r: CanonicalRequest): boolean {
  return !r.data_quality_flags.includes("request_id:unmapped");
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function RequestsView({
  records,
  initial,
}: {
  records: CanonicalRequest[];
  initial: { q: string; zone: string; source: string; status: string; priority: string };
}) {
  const [q, setQ] = useState(initial.q);
  const [zone, setZone] = useState(initial.zone);
  const [source, setSource] = useState(initial.source);
  const [status, setStatus] = useState<string>(initial.status);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState(initial.priority);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const zones = useMemo(() => [...new Set(records.map((r) => r.zone_id).filter(Boolean))].sort() as string[], [records]);
  const sources = useMemo(() => [...new Set(records.map((r) => r.source_system))].sort(), [records]);
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) if (r.status) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = records.filter(
      (r) =>
        (!needle ||
          r.citizen_name?.toLowerCase().includes(needle) ||
          r.description?.toLowerCase().includes(needle) ||
          r.request_id.toLowerCase().includes(needle)) &&
        (!zone || r.zone_id === zone) &&
        (!source || r.source_system === source) &&
        (!status || r.status === status) &&
        (!category || r.category === category) &&
        (!priority || r.priority === priority)
    );
    const val = (r: CanonicalRequest): string | number => {
      if (sort.key === "date") return r.date_submitted ?? "";
      if (sort.key === "zone") return r.zone_id ?? "";
      if (sort.key === "cost") return r.cost_estimate_leke ?? -1;
      return Number(r.request_id) || 0;
    };
    return [...list].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
  }, [records, q, zone, source, status, category, priority, sort]);

  const filtersActive = Boolean(q || zone || source || status || category || priority);
  const selected = records.find((r) => `${r.source_system}#${r.request_id}#${r.source_row_ref}` === selectedId) ?? null;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "date" ? -1 : 1 }));
  }
  function clearFilters() {
    setQ("");
    setZone("");
    setSource("");
    setStatus("");
    setCategory("");
    setPriority("");
  }
  function exportCsv() {
    const cols = ["request_id", "citizen_name", "zone_id", "category", "description", "date_submitted", "status", "priority", "cost_estimate_leke", "department", "source_system"] as const;
    const body = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kerkesat-busulla.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "text-left px-3 py-2.5 text-[10.5px] font-semibold tracking-[0.06em] whitespace-nowrap";
  const sortHead = (key: SortKey, label: string) => (
    <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-[var(--bc-text)] transition-colors">
      {label}
      <ArrowUpDown size={11} style={{ opacity: sort.key === key ? 1 : 0.4 }} />
    </button>
  );

  return (
    <>
      <PageHeader
        title="Kërkesat"
        description="Të gjitha kërkesat e qytetarëve nga katër sistemet, të normalizuara në një tabelë. Kliko një rresht për ta parë burimin e tij dhe cilësinë e të dhënave."
        actions={
          <button
            onClick={exportCsv}
            className="bc-press inline-flex items-center gap-2 h-10 px-4 rounded-full border text-[12.5px] font-semibold transition-colors duration-150 hover:bg-[var(--bc-panel-hover)]"
            style={{ borderColor: "var(--bc-border)", color: "var(--bc-text)", background: "var(--bc-surface)" }}
          >
            <Download size={14} /> Eksporto CSV
          </button>
        }
      />

      {/* One filter row above everything it scopes */}
      <div
        className="bc-rise relative z-20 flex flex-wrap items-center gap-2.5 rounded-[14px] border p-3 mb-4"
        style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
      >
        <label
          className="flex items-center gap-2 h-9 w-[240px] rounded-[10px] border px-3 focus-within:border-[var(--bc-forest)] transition-colors duration-150"
          style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface-2)" }}
        >
          <Search size={14} style={{ color: "var(--bc-text-secondary)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kërko qytetar, kërkesë, ID…"
            aria-label="Kërko"
            className="flex-1 min-w-0 bg-transparent text-[12px] focus:outline-none"
            style={{ color: "var(--bc-text)" }}
          />
        </label>

        <Dropdown
          ariaLabel="Statusi"
          placeholder="Statusi"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Të gjitha statuset", count: records.length },
            ...STATUS_ORDER.map((st) => ({ value: st, label: STATUS_LABEL[st], color: STATUS_COLOR[st], count: statusCounts[st] ?? 0 })),
          ]}
        />
        <Dropdown
          ariaLabel="Zona"
          placeholder="Zona"
          value={zone}
          onChange={setZone}
          options={[{ value: "", label: "Të gjitha zonat" }, ...zones.map((z) => ({ value: z, label: zoneLabel(z) }))]}
        />
        <Dropdown
          ariaLabel="Kategoria"
          placeholder="Kategoria"
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "Të gjitha kategoritë" }, ...Object.entries(CATEGORY_LABEL).map(([k, v]) => ({ value: k, label: v }))]}
        />
        <Dropdown
          ariaLabel="Prioriteti"
          placeholder="Prioriteti"
          value={priority}
          onChange={setPriority}
          options={[{ value: "", label: "Çdo prioritet" }, ...Object.entries(PRIORITY_LABEL).map(([k, v]) => ({ value: k, label: v }))]}
        />
        <Dropdown
          ariaLabel="Burimi"
          placeholder="Burimi"
          value={source}
          onChange={setSource}
          options={[{ value: "", label: "Të gjitha burimet" }, ...sources.map((src) => ({ value: src, label: SOURCE_SHORT[src] ?? src }))]}
        />

        {filtersActive && (
          <button onClick={clearFilters} className="bc-press inline-flex items-center gap-1 h-9 px-3 rounded-[10px] text-[12px] font-semibold" style={{ color: "var(--bc-forest)" }}>
            <X size={13} /> Pastro
          </button>
        )}
        {filtersActive && (
          <span className="ml-auto text-[12px] bc-mono font-semibold" style={{ color: "var(--bc-text-secondary)" }} title="Rezultate / të gjitha">
            {rows.length}/{records.length}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div
          className="bc-rise rounded-[14px] border overflow-hidden"
          style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ color: "var(--bc-text)" }}>
              <thead style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}>
                <tr>
                  <th className={`${th} w-10`}>NR.</th>
                  <th className={th}>{sortHead("id", "ID")}</th>
                  <th className={th}>QYTETARI</th>
                  <th className={th}>{sortHead("zone", "ZONA")}</th>
                  <th className={th}>KATEGORIA</th>
                  <th className={th}>PËRSHKRIMI</th>
                  <th className={th}>{sortHead("date", "DATA")}</th>
                  <th className={th}>STATUSI</th>
                  <th className={th}>BURIMI</th>
                  <th className={`${th} text-right`}>{sortHead("cost", "KOSTOJA")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, n) => {
                  const id = `${r.source_system}#${r.request_id}#${r.source_row_ref}`;
                  const active = selectedId === id;
                  return (
                    <tr
                      key={id}
                      onClick={() => setSelectedId(active ? null : id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedId(active ? null : id))}
                      tabIndex={0}
                      aria-selected={active}
                      className="cursor-pointer border-t transition-colors duration-150 hover:bg-[var(--bc-panel-hover)] focus-visible:bg-[var(--bc-panel-hover)]"
                      style={{ borderColor: "var(--bc-border)", background: active ? "var(--bc-panel-active)" : undefined }}
                    >
                      <td className="px-3 py-2.5 bc-mono text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>{n + 1}</td>
                      <td className="px-3 py-2.5 bc-mono" style={{ color: "var(--bc-text-secondary)" }}>{hasRealId(r) ? r.request_id : "—"}</td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.citizen_name ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{zoneLabel(r.zone_id)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.category ? CATEGORY_LABEL[r.category] : "—"}</td>
                      <td className="px-3 py-2.5 max-w-[260px] truncate" style={{ color: "var(--bc-text-secondary)" }} title={r.description ?? ""}>
                        {r.description ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 bc-mono whitespace-nowrap">{r.date_submitted ?? "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className="text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px]"
                          style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}
                          title={SOURCE_SHORT[r.source_system] ?? r.source_system}
                        >
                          {sourceKind(r.source_system)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right bc-mono whitespace-nowrap">{formatLeke(r.cost_estimate_leke)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                      Asnjë kërkesë nuk përputhet me filtrat.{" "}
                      <button onClick={clearFilters} className="font-semibold underline" style={{ color: "var(--bc-forest)" }}>
                        Pastro filtrat
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside
          className="bc-rise rounded-[14px] border lg:sticky lg:top-0 overflow-hidden"
          style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
          aria-live="polite"
        >
          {selected ? (
            <>
              <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--bc-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-bold" style={{ color: "var(--bc-text)" }}>{selected.citizen_name ?? "Pa emër"}</div>
                    <div className="mt-0.5 text-[11px] bc-mono" style={{ color: "var(--bc-text-secondary)" }}>
                      {hasRealId(selected) ? `ID ${selected.request_id}` : "Pa ID nga burimi"}
                    </div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <p className="mt-3 text-[12.5px] leading-snug" style={{ color: "var(--bc-text)" }}>{selected.description ?? "Ky burim nuk ka përshkrim."}</p>
              </div>
              <dl className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[11.5px]">
                {[
                  ["Zona", zoneLabel(selected.zone_id)],
                  ["Kategoria", selected.category ? CATEGORY_LABEL[selected.category] : "—"],
                  ["Data", selected.date_submitted ?? "—"],
                  ["Prioriteti", selected.priority ? PRIORITY_LABEL[selected.priority] : "—"],
                  ["Kostoja", formatLeke(selected.cost_estimate_leke)],
                  ["Departamenti", selected.department ?? "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-semibold tracking-[0.06em]" style={{ color: "var(--bc-text-secondary)" }}>{k.toUpperCase()}</dt>
                    <dd className="mt-0.5 font-medium" style={{ color: "var(--bc-text)" }}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="px-4 py-3 border-t text-[11.5px]" style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface-2)" }}>
                <div className="text-[10px] font-semibold tracking-[0.06em]" style={{ color: "var(--bc-text-secondary)" }}>BURIMI</div>
                <div className="mt-1 font-medium" style={{ color: "var(--bc-text)" }}>{SOURCE_SHORT[selected.source_system] ?? selected.source_system}</div>
                <div className="mt-0.5 bc-mono text-[10.5px] break-all" style={{ color: "var(--bc-text-secondary)" }}>{selected.source_row_ref}</div>

                <div className="mt-3 text-[10px] font-semibold tracking-[0.06em]" style={{ color: "var(--bc-text-secondary)" }}>CILËSIA E TË DHËNAVE</div>
                {selected.data_quality_flags.length === 0 ? (
                  <div className="mt-1" style={{ color: "var(--bc-st-resolved)" }}>Të gjitha fushat janë të plota.</div>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1" style={{ color: "var(--bc-text-secondary)" }}>
                    {selected.data_quality_flags.map((f) => (
                      <li key={f} className="flex gap-1.5"><span aria-hidden="true">•</span>{describeFlag(f)}</li>
                    ))}
                  </ul>
                )}
              </div>
              {selected.zone_id && (
                <Link
                  href={`/command-center?zone=${selected.zone_id}`}
                  className="flex items-center justify-center gap-2 px-4 py-3 border-t text-[12px] font-semibold transition-colors duration-150 hover:bg-[var(--bc-panel-hover)]"
                  style={{ borderColor: "var(--bc-border)", color: "var(--bc-forest)" }}
                >
                  <MapPin size={14} /> Shiko {zoneLabel(selected.zone_id)} në hartë
                </Link>
              )}
            </>
          ) : (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto grid place-items-center w-10 h-10 rounded-[12px]" style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}>
                <Search size={16} />
              </div>
              <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--bc-text)" }}>Zgjidh një kërkesë</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                Këtu shfaqet burimi i saktë i rreshtit dhe çfarë mungon në të.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
