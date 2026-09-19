import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import Header from "@/components/command-center/Header";
import AppBackground from "@/components/command-center/AppBackground";

/** Shared frame for every Command Center page: background, logo header, and a
 *  scrolling content area. The header lives here so it stays put while pages change. */
export default function CommandCenterLayout({ children }: { children: React.ReactNode }) {
  const { zones } = loadCommandCenterData();
  return (
    <div
      className="relative isolate h-dvh w-full flex flex-col gap-4 p-4"
      style={{ background: "var(--bc-bg)", fontFamily: "var(--font-plex-sans)" }}
    >
      <AppBackground />
      <Header zones={zones.map((z) => ({ zoneId: z.zoneId, zoneLabel: z.zoneLabel }))} />
      <main className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2">{children}</main>
    </div>
  );
}
