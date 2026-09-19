import type { Metadata } from "next";
import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import AnalyticsView from "@/components/command-center/pages/AnalyticsView";

export const metadata: Metadata = { title: "Busulla · Analitika" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { focus } = await searchParams;
  return <AnalyticsView data={loadCommandCenterData()} focus={typeof focus === "string" ? focus : undefined} />;
}
