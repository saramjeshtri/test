"use client";

import { useMemo, useState } from "react";
import type { CanonicalRequest } from "@/lib/fusion/schema";
import { STATUS_ALIASES, CATEGORY_ALIASES } from "@/lib/fusion/dictionaries";

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_ALIASES).map(([k, v]) => [k, v[0]])
);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_ALIASES).map(([k, v]) => [k, v[0]])
);

const STATUS_DOT: Record<string, string> = {
  resolved: "bg-emerald-400",
  in_progress: "bg-amber-400",
  open: "bg-red-400",
};

const SOURCE_SHORT: Record<string, string> = {
  "1_excel_drejtoria_infrastruktures.xlsx": "Excel · Infrastrukturë",
  "2_csv_citizen_portal.csv": "CSV · Portali i Qytetarit",
  "3_pdf_raport_mujor_sherbime.pdf": "PDF · Raport Mujor",
  "4_legacy_munsys_export.txt": "Legacy · MUNSYS",
};

export default function EvidencePanel({
  records,
  selectedZone,
}: {
  records: CanonicalRequest[];
  selectedZone: string | null;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = selectedZone ? records.filter((r) => r.zone_id === selectedZone) : records;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.citizen_name?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.request_id.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 40);
  }, [records, selectedZone, query]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
          Evidencë {selectedZone ? `· ${selectedZone.replace("area-", "Zona ")}` : "· Të gjitha zonat"}
        </h3>
        <span className="text-[10px] text-white/40">{filtered.length} rreshta</span>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Kërko qytetar, kërkesë, ID..."
        className="mb-2 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-sky-400/50"
      />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {filtered.map((r) => (
          <div
            key={`${r.source_system}-${r.source_row_ref}`}
            className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] leading-snug"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white/90 truncate">{r.citizen_name ?? "—"}</span>
              <span className="flex items-center gap-1 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[r.status ?? ""] ?? "bg-white/30"}`} />
                <span className="text-white/50">{r.status ? STATUS_LABEL[r.status] : "—"}</span>
              </span>
            </div>
            <div className="text-white/50 truncate">
              {r.category ? CATEGORY_LABEL[r.category] : "—"}
              {r.description ? ` — ${r.description}` : ""}
            </div>
            <div className="mt-1 flex items-center justify-between text-[9.5px] text-white/30">
              <span>{r.date_submitted ?? "pa datë"}</span>
              <span title={r.source_row_ref}>{SOURCE_SHORT[r.source_system] ?? r.source_system}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-white/30 italic">Asnjë rezultat.</p>
        )}
      </div>
    </div>
  );
}
