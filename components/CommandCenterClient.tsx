"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, TrendingUp, Search, ArrowRight } from "lucide-react";
import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import type { CityMapHandle } from "./CityMap";
import KpiStrip from "./command-center/KpiStrip";
import Panel from "./command-center/Panel";
import ZoneList from "./command-center/ZoneList";
import AttentionCard, { topPriorityZone } from "./command-center/AttentionCard";
import AskBusulla from "./command-center/AskBusulla";
import TrendChart from "./command-center/TrendChart";
import EvidencePanel from "./command-center/EvidencePanel";
import { MapInstrument, MapSearch, ModeSwitch } from "./command-center/MapChrome";
import SidebarTabs, { type SidebarTabId } from "./command-center/SidebarTabs";
import { severityDomain } from "@/lib/commandCenter/severityColor";
import { onHomeAction } from "@/lib/commandCenter/uiEvents";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

export default function CommandCenterClient({
  data,
  initialZone = null,
  initialTab = "trend",
}: {
  data: CommandCenterData;
  initialZone?: string | null;
  initialTab?: SidebarTabId;
}) {
  const [selectedZone, setSelectedZone] = useState<string | null>(initialZone);
  // A link with ?zone= (e.g. from the Analitika table) lands here; follow it when the URL changes without remounting the map.
  const [seenInitialZone, setSeenInitialZone] = useState(initialZone);
  if (initialZone !== seenInitialZone) {
    setSeenInitialZone(initialZone);
    if (initialZone) setSelectedZone(initialZone);
  }
  const [seenInitialTab, setSeenInitialTab] = useState(initialTab);
  const [mode, setMode] = useState<"3d" | "map">("3d");
  const [spinning, setSpinning] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>(initialTab);
  const mapRef = useRef<CityMapHandle>(null);
  // The header search links here with ?tab= to open a hidden part of the sidebar.
  if (initialTab !== seenInitialTab) {
    setSeenInitialTab(initialTab);
    setSidebarTab(initialTab);
  }


  // The header search steers this page in place when it's already open.
  useEffect(
    () =>
      onHomeAction(({ zone, tab }) => {
        if (zone) setSelectedZone(zone);
        if (tab) setSidebarTab(tab);
      }),
    []
  );

  const toggleZone = (zoneId: string) => {
    setSelectedZone((current) => (current === zoneId ? null : zoneId));
  };

  const domain = severityDomain(data.zones.map((z) => z.severityScore));
  const topZone = topPriorityZone(data.zones);

  return (
    <div className="min-h-full lg:h-full w-full flex flex-col gap-4">
      <KpiStrip data={data} />

      {/* Three clear regions -- zones | map | attention+trend/evidence -- each staying
          mostly within its own column, rather than floating cards stacked
          over the map. The map itself stays large and uninterrupted; only
          its own small controls (search, mode switch, compass/zoom, and Ask Busulla)
          sit on top of it. */}
      <div className="flex-1 flex flex-col lg:flex-row lg:items-start gap-4 lg:min-h-0">
        <aside className="bc-stagger order-2 lg:order-none w-full lg:w-[280px] shrink-0 lg:self-stretch lg:overflow-y-auto flex flex-col gap-4 lg:min-h-0">
          <Panel
            title="Zonat"
            icon={<MapPin size={14} style={{ color: "var(--bc-forest)" }} />}
            className="flex-1 min-h-[180px]"
            bodyClassName="p-0 overflow-y-auto"
          >
            <ZoneList zones={data.zones} selectedZone={selectedZone} onSelect={toggleZone} />
          </Panel>
        </aside>

        <div
          className="@container bc-rise order-1 lg:order-none h-[70dvh] lg:h-auto lg:flex-1 lg:self-stretch relative rounded-[14px] overflow-hidden border lg:min-h-0"
          style={{ borderColor: "var(--bc-border)", boxShadow: "var(--bc-shadow)", animationDelay: "60ms" }}
        >
          <CityMap
            ref={mapRef}
            focusZone={selectedZone}
            onFocusChange={setSelectedZone}
            hideChrome
            onModeChange={setMode}
            onSpinningChange={setSpinning}
          />

          <MapSearch
            zones={data.zones.map((z) => ({ zoneId: z.zoneId, label: z.zoneLabel }))}
            searchPlaces={(q) => mapRef.current?.searchPlaces(q) ?? []}
            onPickZone={setSelectedZone}
            onPickPlace={(place) => mapRef.current?.flyToPlace(place)}
            onClear={() => mapRef.current?.clearPlaceMarker()}
          />
          <ModeSwitch mode={mode} onSwitchMode={(m) => mapRef.current?.switchMode(m)} />
          <MapInstrument
            onResetNorth={() => mapRef.current?.resetNorth()}
            getHeading={() => mapRef.current?.getHeading() ?? 0}
            onNudge={(patch) => mapRef.current?.nudge(patch)}
            spinning={spinning}
            onToggleSpin={() => mapRef.current?.toggleSpin()}
          />

          {/* The one deliberate exception -- a single subtle control on the
              map, not a stack of content cards. */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[380px] max-w-[calc(100%-32px)]">
            <AskBusulla topZone={topZone} onAsk={(zoneId) => setSelectedZone(zoneId)} />
          </div>
        </div>

        <aside className="bc-stagger order-3 lg:order-none w-full lg:w-[320px] shrink-0 lg:self-stretch lg:overflow-y-auto flex flex-col gap-4 lg:min-h-0">
          {topZone && (
            <AttentionCard
              zone={topZone}
              domain={domain}
              onViewEvidence={() => {
                setSelectedZone(topZone.zoneId);
                setSidebarTab("evidence");
              }}
            />
          )}

          <SidebarTabs
            active={sidebarTab}
            onChange={setSidebarTab}
            tabs={[
              {
                id: "trend",
                label: "Trendi",
                icon: <TrendingUp size={13} />,
                content: (
                  <Panel
                    title="Trendi mujor"
                    icon={<TrendingUp size={14} style={{ color: "var(--bc-forest)" }} />}
                    rise={false}
                    right={
                      <Link
                        href="/command-center/analytics"
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                        style={{ color: "var(--bc-forest)" }}
                      >
                        Analitika e plotë <ArrowRight size={12} />
                      </Link>
                    }
                  >
                    <TrendChart data={data.trend} />
                  </Panel>
                ),
              },
              {
                id: "evidence",
                label: "Evidencë",
                icon: <Search size={13} />,
                content: (
                  <Panel
                    title="Evidencë"
                    icon={<Search size={14} style={{ color: "var(--bc-forest)" }} />}
                    className="flex-1 min-h-0"
                    rise={false}
                    right={
                      <Link
                        href="/command-center/requests"
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                        style={{ color: "var(--bc-forest)" }}
                      >
                        Të gjitha kërkesat <ArrowRight size={12} />
                      </Link>
                    }
                  >
                    <EvidencePanel
                      records={data.records}
                      selectedZone={selectedZone}
                      onHoverZone={(zoneId) => mapRef.current?.highlightZone(zoneId)}
                    />
                  </Panel>
                ),
              },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
