import type { Metadata } from "next";
import AgentView from "@/components/command-center/pages/AgentView";

export const metadata: Metadata = { title: "Busulla · Agjenti" };

export default function AgentPage() {
  return <AgentView />;
}
