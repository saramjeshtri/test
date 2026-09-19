import type { Metadata } from "next";
import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import RequestsView from "@/components/command-center/pages/RequestsView";

export const metadata: Metadata = { title: "Busulla · Kërkesat" };

function first(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const { records } = loadCommandCenterData();
  return (
    // Keyed by the filters so following a link from the header search (?status=open) to this same page starts fresh.
    <RequestsView
      key={JSON.stringify(params)}
      records={records}
      initial={{
        q: first(params.q),
        zone: first(params.zone),
        source: first(params.source),
        status: first(params.status),
        priority: first(params.priority),
      }}
    />
  );
}
