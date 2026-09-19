"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation, Plus, Minus, Play, Pause, Search, X, MapPin, Landmark, Route, Building2 } from "lucide-react";
import type { MapPlace } from "../CityMap";

type NudgePatch = { heading?: number; pitch?: number; range?: number };

/** Rotates live with the camera heading (polled via rAF) -- a real
 *  orientation indicator, not a static icon. Click still resets north. */
function LiveCompass({ onResetNorth, getHeading }: { onResetNorth: () => void; getHeading: () => number }) {
  const iconRef = useRef<SVGSVGElement>(null);

  // Written straight to the DOM: heading changes every frame while the camera
  // moves, and routing that through React state re-rendered the whole control
  // 60 times a second.
  useEffect(() => {
    let raf: number;
    let alive = true;
    let last = NaN;
    function tick() {
      if (!alive) return;
      const h = getHeading();
      if (h !== last && iconRef.current) {
        iconRef.current.style.transform = `rotate(${-h}deg)`;
        last = h;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [getHeading]);

  return (
    <button
      onClick={onResetNorth}
      title="Drejto veriun"
      className="bc-press w-[38px] h-[38px] grid place-items-center hover:bg-[var(--bc-panel-hover)]"
      style={{ color: "var(--bc-text)" }}
    >
      <Navigation ref={iconRef} size={16} />
    </button>
  );
}

/**
 * The map's single instrument card: orientation, zoom, and playback --
 * grouped as one piece of equipment instead of scattered floating buttons.
 * Every control here does something real: the compass tracks live camera
 * heading and resets it on click, zoom changes the camera range, and
 * play/pause drives the actual auto-rotate. Rotate-left/right was dropped --
 * dragging the map already rotates it, so a dedicated button was redundant.
 */
export function MapInstrument({
  onResetNorth,
  getHeading,
  onNudge,
  spinning,
  onToggleSpin,
}: {
  onResetNorth: () => void;
  getHeading: () => number;
  onNudge: (patch: NudgePatch) => void;
  spinning: boolean;
  onToggleSpin: () => void;
}) {
  const cell = "bc-press w-[38px] h-[38px] grid place-items-center hover:bg-[var(--bc-panel-hover)]";
  const divider = <div className="h-px" style={{ background: "var(--bc-border)" }} />;

  return (
    <div
      className="bc-glass absolute bottom-4 left-4 z-10 flex flex-col rounded-[14px] overflow-hidden"
    >
      <LiveCompass onResetNorth={onResetNorth} getHeading={getHeading} />
      {divider}
      <button onClick={() => onNudge({ range: 0.8 })} title="Zmadho" className={cell} style={{ color: "var(--bc-text)" }}>
        <Plus size={15} />
      </button>
      {divider}
      <button onClick={() => onNudge({ range: 1.25 })} title="Zvogëlo" className={cell} style={{ color: "var(--bc-text)" }}>
        <Minus size={15} />
      </button>
      {divider}
      <button
        onClick={onToggleSpin}
        title={spinning ? "Ndalo rrotullimin" : "Rrotullo automatikisht"}
        className={cell}
        style={{ color: spinning ? "var(--bc-forest)" : "var(--bc-text)" }}
      >
        {spinning ? <Pause size={15} /> : <Play size={15} />}
      </button>
    </div>
  );
}

export function ModeSwitch({ mode, onSwitchMode }: { mode: "3d" | "map"; onSwitchMode: (m: "3d" | "map") => void }) {
  const options: { id: "3d" | "map"; label: string }[] = [
    { id: "3d", label: "3D" },
    { id: "map", label: "2D" },
  ];
  const index = mode === "3d" ? 0 : 1;

  return (
    <div className="bc-glass absolute top-4 right-4 z-10 rounded-[14px] p-1">
      <div className="relative grid grid-cols-2">
        <span
          aria-hidden="true"
          className="bc-seg-pill absolute inset-y-0 left-0 w-1/2 rounded-[9px]"
          style={{ transform: `translateX(${index * 100}%)`, transition: "transform 240ms var(--ease-drawer)" }}
        />
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onSwitchMode(o.id)}
            className="bc-press relative z-10 px-5 py-1.5 text-[11.5px] font-semibold"
            style={{ color: mode === o.id ? "var(--bc-forest)" : "var(--bc-text-secondary)", transitionProperty: "transform, color" }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const KIND_META = {
  zone: { label: "Zonë", Icon: MapPin },
  area: { label: "Lagje / fshat", Icon: Building2 },
  spot: { label: "Vend", Icon: Landmark },
  street: { label: "Rrugë", Icon: Route },
} as const;

type Hit =
  | { type: "zone"; key: string; name: string; zoneId: string }
  | { type: "place"; key: string; name: string; place: MapPlace };

/**
 * Search box for the map itself -- finds the six zones and every named place on the city
 * (villages, landmarks, streets), then flies there. It drives the one Cesium camera, so it
 * behaves the same in the 3D view and the 2D map.
 */
export function MapSearch({
  zones,
  searchPlaces,
  onPickZone,
  onPickPlace,
  onClear,
}: {
  zones: { zoneId: string; label: string }[];
  searchPlaces: (query: string) => MapPlace[];
  onPickZone: (zoneId: string) => void;
  onPickPlace: (place: MapPlace) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const q = fold(query.trim());
    if (!q || picked) return [];
    const zoneHits: Hit[] = zones
      .filter((z) => fold(z.label).includes(q) || fold(z.zoneId).includes(q))
      .map((z) => ({ type: "zone", key: z.zoneId, name: z.label, zoneId: z.zoneId }));
    const placeHits: Hit[] = searchPlaces(query).map((p) => ({ type: "place", key: `${p.kind}:${p.name}`, name: p.name, place: p }));
    return [...zoneHits, ...placeHits];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, picked, zones]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function choose(hit: Hit) {
    setQuery(hit.name);
    setPicked(true);
    setOpen(false);
    if (hit.type === "zone") onPickZone(hit.zoneId);
    else onPickPlace(hit.place);
  }

  function clear() {
    setQuery("");
    setPicked(false);
    setOpen(false);
    onClear();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    }
  }

  const showList = open && !picked && query.trim() !== "";

  return (
    <div ref={boxRef} className="absolute top-4 left-4 z-20 w-[min(280px,calc(50%-72px))] @max-[560px]:w-[calc(100%-32px)] @max-[560px]:top-[68px]">
      <div className="bc-glass flex items-center gap-2 h-[42px] rounded-[14px] px-3.5 focus-within:border-[var(--bc-forest)] transition-colors duration-150">
        <Search size={14} className="shrink-0" style={{ color: "var(--bc-text-secondary)" }} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(false);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Kërko vend në hartë…"
          aria-label="Kërko vend në hartë"
          role="combobox"
          aria-expanded={showList}
          aria-controls="map-search-results"
          aria-autocomplete="list"
          className="flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
          style={{ color: "var(--bc-text)" }}
        />
        {query && (
          <button onClick={clear} aria-label="Pastro kërkimin" className="bc-press grid place-items-center w-6 h-6 rounded-full hover:bg-[var(--bc-panel-hover)]" style={{ color: "var(--bc-text-secondary)" }}>
            <X size={13} />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id="map-search-results"
          role="listbox"
          className="bc-pop bc-glass mt-2 rounded-[14px] overflow-hidden py-1 max-h-[300px] overflow-y-auto"
          style={{ transformOrigin: "top left" }}
        >
          {hits.length === 0 && (
            <li className="px-3.5 py-3 text-[12px]" style={{ color: "var(--bc-text-secondary)" }}>
              Asnjë vend nuk përputhet me “{query.trim()}”.
            </li>
          )}
          {hits.map((h, i) => {
            const meta = KIND_META[h.type === "zone" ? "zone" : h.place.kind];
            return (
              <li key={h.key} role="option" aria-selected={i === active}>
                <button
                  onClick={() => choose(h)}
                  onPointerEnter={() => setActive(i)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left"
                  style={{ background: i === active ? "var(--bc-panel-hover)" : undefined }}
                >
                  <span className="grid place-items-center w-7 h-7 rounded-[9px] shrink-0" style={{ background: "var(--bc-surface-2)", color: "var(--bc-forest)" }}>
                    <meta.Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold" style={{ color: "var(--bc-text)" }}>{h.name}</span>
                    <span className="block text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>{meta.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
