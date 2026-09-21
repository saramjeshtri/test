"use client";

import { MessageSquare, PanelLeftClose, SquarePen, Trash2 } from "lucide-react";
import type { Chat } from "./chatStore";

/** The list of conversations. It can be closed completely (the button in its header). */
export default function ChatSidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
  className = "",
}: {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-label="Bisedat"
      className={`flex-col w-[280px] shrink-0 rounded-[14px] border overflow-hidden ${className}`}
      style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
    >
      <div className="flex items-center gap-2 px-4 h-[60px] shrink-0 border-b" style={{ borderColor: "var(--bc-border)" }}>
        <MessageSquare size={17} style={{ color: "var(--bc-text)" }} />
        <h2 className="flex-1 text-[15px] font-bold" style={{ color: "var(--bc-text)" }}>Biseda</h2>
        <button
          onClick={onNew}
          aria-label="Bisedë e re"
          title="Bisedë e re"
          className="bc-press grid place-items-center w-8 h-8 rounded-[10px] hover:bg-[var(--bc-panel-hover)]"
          style={{ background: "var(--bc-surface-2)", color: "var(--bc-text)" }}
        >
          <SquarePen size={15} />
        </button>
        <button
          onClick={onClose}
          aria-label="Mbyll listën e bisedave"
          title="Mbyll"
          className="bc-press grid place-items-center w-8 h-8 rounded-[10px] hover:bg-[var(--bc-panel-hover)]"
          style={{ color: "var(--bc-text-secondary)" }}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <p className="px-3 py-4 text-[12px]" style={{ color: "var(--bc-text-secondary)" }}>
            Bisedat e tua do të shfaqen këtu.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--bc-panel-hover)]"
                    style={{ background: active ? "var(--bc-panel-active)" : undefined, color: "var(--bc-text)", fontWeight: active ? 600 : 500 }}
                  >
                    <MessageSquare size={15} className="shrink-0" style={{ color: "var(--bc-text-secondary)" }} />
                    <span className="truncate pr-6">{c.title}</span>
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    aria-label={`Fshi bisedën “${c.title}”`}
                    title="Fshi"
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-[8px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-[var(--bc-surface-2)]"
                    style={{ color: "var(--bc-text-secondary)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
