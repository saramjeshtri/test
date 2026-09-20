"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, FileText, BarChart3, Database, ChevronDown } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import CommandSearch from "./CommandSearch";

const NAV = [
  { href: "/command-center", label: "Përmbledhje", icon: Home, exact: true },
  { href: "/command-center/requests", label: "Kërkesat", icon: FileText, exact: false },
  { href: "/command-center/analytics", label: "Analitika", icon: BarChart3, exact: false },
  { href: "/command-center/data-sources", label: "Burimet e të dhënave", icon: Database, exact: false },
] as const;

/** Closes a popover when the user clicks anywhere else or presses Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Popover({ children, width = 288 }: { children: ReactNode; width?: number }) {
  return (
    <div
      className="bc-pop absolute right-0 top-full mt-2 z-50 rounded-[14px] border overflow-hidden"
      style={{
        width,
        transformOrigin: "top right",
        borderColor: "var(--bc-border)",
        background: "var(--bc-surface)",
        boxShadow: "var(--bc-shadow-float)",
      }}
    >
      {children}
    </div>
  );
}

/** The logo lockup: compass mark, then a divider, then the wordmark. The wordmark is
 *  the original artwork used as a mask, so it takes the theme's text color (white on
 *  the dark UI, ink on the light UI) instead of needing two image files. */
function Logo() {
  return (
    <Link href="/command-center" className="flex items-center gap-3 pr-2" aria-label="Busulla · Ballina">
      {/* Bare artwork, no tile: the dark-mode file has the same shapes in lighter inks, and
          globals.css shows whichever matches data-theme (set before first paint, so no flash). */}
      <Image src="/brand/busulla-logo-light.png" alt="" width={40} height={48} priority className="bc-logo-light h-12 w-auto shrink-0" />
      <Image src="/brand/busulla-logo-dark.png" alt="" width={40} height={48} priority className="bc-logo-dark h-12 w-auto shrink-0" />
      <span className="hidden sm:block w-px h-9 shrink-0" style={{ background: "var(--bc-border)" }} aria-hidden="true" />
      <span
        role="img"
        aria-label="Busulla"
        className="hidden sm:block h-[19px] w-[146px]"
        style={{
          backgroundColor: "var(--bc-text)",
          WebkitMaskImage: "url(/brand/busulla-wordmark.png)",
          maskImage: "url(/brand/busulla-wordmark.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      />
    </Link>
  );
}

export default function Header({ zones }: { zones: { zoneId: string; zoneLabel: string }[] }) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = () => setProfileOpen(false);
  const profileRef = useDismiss(profileOpen, closeProfile);

  return (
    <header
      className="bc-rise relative z-40 flex items-center gap-3 shrink-0 h-[68px] rounded-[14px] border px-3.5"
      style={{ borderColor: "var(--bc-border)", background: "var(--bc-surface)", boxShadow: "var(--bc-shadow)" }}
    >
      <Logo />

      <nav className="hidden md:flex items-center gap-1" aria-label="Navigimi kryesor">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="bc-press flex items-center gap-2 h-10 px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-150"
              style={{
                background: active ? "var(--bc-forest-tint)" : "transparent",
                color: active ? "var(--bc-forest)" : "var(--bc-text-secondary)",
              }}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <CommandSearch zones={zones} />

      <ThemeToggle />

      <div ref={profileRef} className="relative">
        <button
          onClick={() => setProfileOpen((o) => !o)}
          aria-expanded={profileOpen}
          aria-label="Profili"
          className="bc-press flex items-center gap-1.5 h-10 pl-1 pr-2 rounded-full border transition-colors duration-150 hover:bg-[var(--bc-panel-hover)]"
          style={{ borderColor: "var(--bc-border)" }}
        >
          <span
            className="grid place-items-center w-8 h-8 rounded-full text-[11px] font-bold"
            style={{ background: "var(--bc-forest)", color: "#FFFFFF" }}
          >
            DM
          </span>
          <ChevronDown
            size={14}
            style={{
              color: "var(--bc-text-secondary)",
              transform: profileOpen ? "rotate(180deg)" : "none",
              transition: "transform 200ms var(--ease-out)",
            }}
          />
        </button>
        {profileOpen && (
          <Popover width={264}>
            <div className="px-4 py-3.5">
              <div className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>
                Përdorues demo
              </div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                Drejtoria e Planifikimit · Bashkia Elbasan
              </div>
            </div>
            <div
              className="px-4 py-2.5 border-t text-[11px] leading-snug"
              style={{ borderColor: "var(--bc-border)", color: "var(--bc-text-secondary)", background: "var(--bc-surface-2)" }}
            >
              Modalitet demo: pa hyrje dhe pa të dhëna personale. Në pilotim, këtu lidhet identiteti i bashkisë.
            </div>
          </Popover>
        )}
      </div>
    </header>
  );
}
