"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CanonicalRequest } from "@/lib/fusion/schema";
import { STATUS_LABEL, CATEGORY_LABEL, SOURCE_SHORT, sourceKind } from "@/lib/commandCenter/labels";

const STATUS_COLOR: Record<string, string> = {
  resolved: "var(--bc-st-resolved)",
  in_progress: "var(--bc-st-progress)",
  open: "var(--bc-st-open)",
};

export default function EvidencePanel({
  records,
  selectedZone,
  onHoverZone,
  query: controlledQuery,
  onQueryChange,
}: {
  records: CanonicalRequest[];
  selectedZone: string | null;
  /** Optional: lets the header search drive this box. Falls back to local state. */
  query?: string;
  onQueryChange?: (q: string) => void;
  /** Hovering a row highlights that record's zone on the map -- the row
   *  itself doesn't move the camera, just draws the connection. */
  onHoverZone?: (zoneId: string | null) => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;

  const zoneRecords = useMemo(
    () => (selectedZone ? records.filter((r) => r.zone_id === selectedZone) : records),
    [records, selectedZone]
  );

  const filtered = useMemo(() => {
    let list = zoneRecords;
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
  }, [zoneRecords, query]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>
        <span>{selectedZone ? selectedZone.replace("area-", "Zona ") : "Të gjitha zonat"}</span>
        <span className="bc-mono font-semibold">{filtered.length}</span>
      </div>

      <div className="relative mb-2 shrink-0">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--bc-text-secondary)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kërko qytetar, kërkesë, ID..."
          className="w-full rounded-[10px] pl-8 pr-3 py-2 text-[11.5px] focus:outline-none"
          style={{ background: "var(--bc-surface-2)", border: "1px solid var(--bc-border)", color: "var(--bc-text)" }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.map((r, i) => (
          <div
            key={`${r.source_system}-${r.source_row_ref}`}
            className="py-2.5"
            style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--bc-border)" : "none" }}
            onMouseEnter={() => r.zone_id && onHoverZone?.(r.zone_id)}
            onMouseLeave={() => onHoverZone?.(null)}
            title={`${SOURCE_SHORT[r.source_system] ?? r.source_system} · ${r.source_row_ref}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold truncate" style={{ color: "var(--bc-text)" }}>
                {r.citizen_name ?? "—"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[r.status ?? ""] ?? "#999" }} />
            </div>
            <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--bc-text-secondary)" }}>
              {r.category ? CATEGORY_LABEL[r.category] : "—"}
              {r.description ? ` · ${r.description}` : ""}
            </div>
            <div className="mt-1 flex items-center justify-between text-[9.5px] tracking-wide" style={{ color: "var(--bc-text-secondary)" }}>
              <span className="bc-mono">{sourceKind(r.source_system)} · {r.date_submitted ?? "pa datë"}</span>
              <span className="font-semibold" style={{ color: STATUS_COLOR[r.status ?? ""] ?? "var(--bc-text-secondary)" }}>
                {(r.status ? STATUS_LABEL[r.status] : "—").toUpperCase()}
              </span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] italic" style={{ color: "var(--bc-text-secondary)" }}>
            Asnjë rezultat.
          </p>
        )}
      </div>
    </div>
  );
}
