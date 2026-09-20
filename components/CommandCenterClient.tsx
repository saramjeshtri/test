"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, TrendingUp, Search, ArrowRight } from "lucide-react";
import type { CommandCenterData } from "@/lib/commandCenter/aggregate";
import type { CityMapHandle } from "./CityMap";
import KpiStrip from "./command-center/KpiStrip";
import Panel from "./command-center/Panel";
import ZoneList from "./command-center/ZoneList";
import InsightCard from "./command-center/InsightCard";
import TrendChart from "./command-center/TrendChart";
import EvidencePanel from "./command-center/EvidencePanel";
import SidebarTabs, { type SidebarTabId } from "./command-center/SidebarTabs";
import { MapInstrument, MapSearch, ModeSwitch } from "./command-center/MapChrome";
import { severityDomain, severityToColor } from "@/lib/commandCenter/severityColor";
import { averageZoneTrend, buildInsight, topPriorityZone, zoneTrend } from "@/lib/commandCenter/insights";
import { onHomeAction } from "@/lib/commandCenter/uiEvents";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

export default function CommandCenterClient({
  data,
  initialZone = null,
  initialTab,
}: {
  data: CommandCenterData;
  initialZone?: string | null;
  /** From the header search's ?tab= link: which sidebar tab to open. */
  initialTab?: SidebarTabId;
}) {
  const [selectedZone, setSelectedZone] = useState<string | null>(initialZone);
  // A link with ?zone= (e.g. from the Analitika table) lands here; follow it when the URL changes without remounting the map.
  const [seenInitialZone, setSeenInitialZone] = useState(initialZone);
  if (initialZone !== seenInitialZone) {
    setSeenInitialZone(initialZone);
    if (initialZone) setSelectedZone(initialZone);
  }
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>(initialTab ?? "trend");
  const [seenInitialTab, setSeenInitialTab] = useState(initialTab);
  if (initialTab !== seenInitialTab) {
    setSeenInitialTab(initialTab);
    if (initialTab) setSidebarTab(initialTab);
  }
  const [mode, setMode] = useState<"3d" | "map">("3d");
  const [spinning, setSpinning] = useState(false);
  const mapRef = useRef<CityMapHandle>(null);

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

  // With a zone chosen, everything on the right is about that zone; otherwise it points at the zone
  // that most needs attention and shows the whole city.
  const focusId = selectedZone ?? topZone?.zoneId ?? null;
  const insight = useMemo(() => (focusId ? buildInsight(data, focusId) : null), [data, focusId]);
  const focusScore = data.zones.find((z) => z.zoneId === focusId)?.severityScore ?? 0;

  const trendMain = useMemo(
    () => (selectedZone ? zoneTrend(data.records, data.trend, selectedZone) : data.trend),
    [data, selectedZone]
  );
  const trendRef = useMemo(
    () => (selectedZone ? averageZoneTrend(data.trend, data.zones.length) : undefined),
    [data, selectedZone]
  );
  const selectedLabel = data.zones.find((z) => z.zoneId === selectedZone)?.zoneLabel;

  return (
    <div className="min-h-full lg:h-full w-full flex flex-col gap-4">
      <KpiStrip data={data} />

      {/* Three clear regions -- zones | map | insight+trend+evidence -- each staying
          mostly within its own column. Picking a zone changes all three at once: the map
          flies there and dims the rest, the right column switches to that zone's analysis,
          its own trend against the average zone, and its requests. */}
      <div className="flex-1 flex flex-col lg:flex-row lg:items-start gap-4 lg:min-h-0">
        <aside className="bc-stagger order-2 lg:order-none w-full lg:w-[280px] shrink-0 lg:self-stretch lg:overflow-y-auto flex flex-col gap-4 lg:min-h-0">
          <Panel
            title="Zonat"
            icon={<MapPin size={14} style={{ color: "var(--bc-forest)" }} />}
            right={
              <span className="text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                sipas prioritetit
              </span>
            }
            className="flex-1 min-h-[180px]"
            bodyClassName="p-0 overflow-y-auto flex flex-col"
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
        </div>

        <aside className="order-3 lg:order-none w-full lg:w-[340px] shrink-0 lg:self-stretch lg:overflow-y-auto flex flex-col gap-4 lg:min-h-0">
          {insight && (
            <InsightCard
              key={selectedZone ?? "city"}
              insight={insight}
              color={severityToColor(focusScore, domain)}
              selected={selectedZone !== null}
              onOpenZone={setSelectedZone}
              onViewEvidence={() => setSidebarTab("evidence")}
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
                    title={selectedLabel ? `Trendi · ${selectedLabel}` : "Trendi mujor"}
                    icon={<TrendingUp size={14} style={{ color: "var(--bc-forest)" }} />}
                    className="flex-1 min-h-0"
                    bodyClassName="flex flex-col"
                    rise={false}
                    right={
                      selectedLabel ? (
                        <span className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--bc-text-secondary)" }} />
                          mesatarja e zonave
                        </span>
                      ) : (
                        <Link
                          href="/command-center/analytics"
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                          style={{ color: "var(--bc-forest)" }}
                        >
                          Analitika e plotë <ArrowRight size={12} />
                        </Link>
                      )
                    }
                  >
                    <TrendChart key={selectedZone ?? "city"} data={trendMain} reference={trendRef} />
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
