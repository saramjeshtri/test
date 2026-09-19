"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

// data-theme is set on <html> by the inline script in layout.tsx before React
// mounts. set() below dispatches this event after changing it, so React
// knows to re-read the DOM and re-render.
function subscribe(callback: () => void) {
  window.addEventListener("busulla-theme-change", callback);
  return () => window.removeEventListener("busulla-theme-change", callback);
}
function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
// The server never knows the visitor's saved theme; this is corrected on the
// client right after hydration, via useSyncExternalStore's own contract --
// not a manual setState-in-effect, so it doesn't cause a hydration mismatch.
function getServerSnapshot(): Theme {
  return "light";
}

const BUTTON = 28; // px, matches w-7
const GAP = 2; // px, matches gap-0.5

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function set(next: Theme) {
    if (theme === next) return;
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("busulla-theme", next);
    } catch {
      // private browsing / storage disabled -- theme just won't persist
    }
    window.dispatchEvent(new Event("busulla-theme-change"));
  }

  const btn = (t: Theme, Icon: typeof Sun) => (
    <button
      onClick={() => set(t)}
      aria-label={t === "light" ? "Modaliteti i dritës" : "Modaliteti i errët"}
      aria-pressed={theme === t}
      className="bc-press relative z-10 flex items-center justify-center w-7 h-7 rounded-[9px]"
    >
      <Icon
        size={13}
        style={{
          color: theme === t ? "var(--bc-forest)" : "var(--bc-text-secondary)",
          transition: "color 200ms ease",
        }}
      />
    </button>
  );

  return (
    <div className="bc-seg-track relative flex items-center gap-0.5">
      {/* sliding highlight -- the actual "press" animation, not a full-page effect */}
      <span
        aria-hidden="true"
        className="bc-seg-pill absolute left-[3px] top-[3px] bottom-[3px] w-7 rounded-[9px]"
        style={{
          transform: `translateX(${theme === "dark" ? BUTTON + GAP : 0}px)`,
          transition: "transform 240ms var(--ease-drawer)",
        }}
      />
      {btn("light", Sun)}
      {btn("dark", Moon)}
    </div>
  );
}
