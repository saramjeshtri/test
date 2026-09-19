"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { buildSearchIndex, searchItems, type SearchItem } from "@/lib/commandCenter/searchIndex";
import { emitHomeAction, focusSection } from "@/lib/commandCenter/uiEvents";

/** Header search: a quick way to reach anything that isn't on screen right now -- another page,
 *  a zone, a chart or tab inside a page, a ready-made filter. ⌘K / Ctrl+K focuses it from anywhere. */
export default function CommandSearch({ zones }: { zones: { zoneId: string; zoneLabel: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => buildSearchIndex(zones), [zones]);
  const results = useMemo(() => searchItems(index, query), [index, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function go(item: SearchItem) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();

    const here = pathname === item.path;
    // Already on the target page: act in place, so picking the same thing twice still works.
    if (here && item.home) return emitHomeAction(item.home);
    if (here && item.section) return focusSection(item.section);

    const qs = item.query ? `?${new URLSearchParams(item.query).toString()}` : "";
    router.push(`${item.path}${qs}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div ref={boxRef} className="relative hidden xl:block">
      <div
        role="search"
        className="flex items-center gap-2 h-10 w-[270px] rounded-full border px-3.5 transition-colors duration-150 focus-within:border-[var(--bc-forest)]"
        style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface-2)" }}
      >
        <Search size={15} className="shrink-0" style={{ color: "var(--bc-text-secondary)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Shko te… zona, grafik, faqe"
          aria-label="Kërko një faqe, zonë ose pjesë të aplikacionit"
          role="combobox"
          aria-expanded={open}
          aria-controls="command-search-results"
          aria-autocomplete="list"
          className="flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
          style={{ color: "var(--bc-text)" }}
        />
        <kbd
          className="bc-mono hidden 2xl:block text-[10px] font-semibold px-1.5 py-0.5 rounded-[6px] border"
          style={{ color: "var(--bc-text-secondary)", borderColor: "var(--bc-border)", background: "var(--bc-surface)" }}
        >
          ⌘K
        </kbd>
      </div>

      {open && (
        <div
          ref={listRef}
          id="command-search-results"
          role="listbox"
          className="bc-pop absolute right-0 top-full mt-2 z-50 w-[360px] max-h-[420px] overflow-y-auto rounded-[14px] border py-1.5"
          style={{ transformOrigin: "top right", borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow-float)" }}
        >
          {results.length === 0 && (
            <p className="px-4 py-4 text-[12px]" style={{ color: "var(--bc-text-secondary)" }}>
              Nuk u gjet asgjë për “{query.trim()}”. Për të kërkuar një kërkesë ose qytetar, përdor kërkimin te faqja Kërkesat.
            </p>
          )}
          {results.map((item, i) => {
            const header = i === 0 || results[i - 1].group !== item.group ? item.group : null;
            const isActive = i === active;
            return (
              <div key={item.id}>
                {header && (
                  <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>
                    {header.toUpperCase()}
                  </div>
                )}
                <button
                  role="option"
                  aria-selected={isActive}
                  data-index={i}
                  onClick={() => go(item)}
                  onPointerEnter={() => setActive(i)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left"
                  style={{ background: isActive ? "var(--bc-panel-hover)" : undefined }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold" style={{ color: "var(--bc-text)" }}>{item.label}</span>
                    <span className="block truncate text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>{item.hint}</span>
                  </span>
                  {isActive && <CornerDownLeft size={13} className="shrink-0" style={{ color: "var(--bc-text-secondary)" }} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
