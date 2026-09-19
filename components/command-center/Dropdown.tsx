"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption = {
  value: string;
  label: string;
  /** Small number shown at the right of the row (e.g. how many records match). */
  count?: number;
  /** Colored dot before the label (e.g. a status color). */
  color?: string;
};

/**
 * A styled replacement for the browser's native <select>, whose arrow can't be spaced
 * away from the border. Trigger + listbox popover with arrow-key / Enter / Escape support.
 * The first option is treated as "no filter": while it's chosen the trigger shows `placeholder`
 * muted, and once something else is chosen the trigger turns green and shows that choice.
 */
export default function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  align = "left",
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  ariaLabel: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];
  const filtered = Boolean(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function choose(i: number) {
    onChange(options[i].value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="bc-press inline-flex items-center gap-3 h-9 pl-3.5 pr-3 rounded-[10px] border text-[12px] font-medium whitespace-nowrap transition-colors duration-150 hover:bg-[var(--bc-panel-hover)] focus-visible:border-[var(--bc-forest)]"
        style={{
          borderColor: filtered || open ? "var(--bc-forest)" : "var(--bc-border)",
          background: filtered ? "var(--bc-forest-tint)" : "var(--bc-surface)",
          color: filtered ? "var(--bc-forest)" : "var(--bc-text-secondary)",
        }}
      >
        <span className="flex items-center gap-2">
          {filtered && selected?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selected.color }} />}
          {filtered ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          aria-label={ariaLabel}
          className={`bc-pop absolute top-full mt-1.5 z-50 min-w-full w-max max-w-[300px] max-h-[280px] overflow-y-auto rounded-[12px] border p-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            transformOrigin: align === "right" ? "top right" : "top left",
            borderColor: "var(--bc-border)",
            background: "var(--bc-surface)",
            boxShadow: "var(--bc-shadow-float)",
          }}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value || "__all"}
                id={`${uid}-${i}`}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className="flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-[8px] text-[12px] cursor-pointer whitespace-nowrap"
                style={{
                  background: i === active ? "var(--bc-panel-hover)" : undefined,
                  color: "var(--bc-text)",
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                {o.color ? (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />
                ) : (
                  <span className="w-2 shrink-0" aria-hidden="true" />
                )}
                <span className="flex-1">{o.label}</span>
                {o.count !== undefined && (
                  <span className="bc-mono text-[11px] ml-3" style={{ color: "var(--bc-text-secondary)" }}>
                    {o.count}
                  </span>
                )}
                <span className="w-3.5 shrink-0 grid place-items-center" style={{ color: "var(--bc-forest)" }}>
                  {isSelected && <Check size={13} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
