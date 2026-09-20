import type { Metadata } from "next";
import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import CommandCenterClient from "@/components/CommandCenterClient";

export const metadata: Metadata = {
  title: "Busulla · Përmbledhje",
};

export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { zone, tab } = await searchParams;
  const data = loadCommandCenterData();
  const initialZone = typeof zone === "string" && data.zones.some((z) => z.zoneId === zone) ? zone : null;
  return <CommandCenterClient data={data} initialZone={initialZone} initialTab={tab === "evidence" || tab === "trend" ? tab : undefined} />;
}
