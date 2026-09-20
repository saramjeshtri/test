"use client";

import type { ReactNode } from "react";

export type SidebarTabId = "trend" | "evidence" | "plan";

type Tab = { id: SidebarTabId; label: string; icon: ReactNode; content: ReactNode };

/** One panel visible at a time instead of stacking Trend + Evidence
 *  on top of each other -- keeps the right column from feeling crowded. */
export default function SidebarTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: SidebarTabId;
  onChange: (id: SidebarTabId) => void;
}) {
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === active));

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="bc-seg-track shrink-0">
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {/* One pill that slides between tabs (transform only, so it can be
              interrupted mid-move and retargets from where it is). */}
          <span
            aria-hidden="true"
            className="bc-seg-pill absolute inset-y-0 left-0 rounded-[9px]"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${activeIndex * 100}%)`,
              transition: "transform 240ms var(--ease-drawer)",
            }}
          />
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="bc-press relative z-10 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11.5px] font-semibold"
              style={{
                color: active === t.id ? "var(--bc-forest)" : "var(--bc-text-secondary)",
                transitionProperty: "transform, color",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{activeTab.content}</div>
    </div>
  );
}
