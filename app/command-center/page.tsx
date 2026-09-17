import { loadCommandCenterData } from "@/lib/commandCenter/aggregate";
import CommandCenterClient from "@/components/CommandCenterClient";

export default function CommandCenterPage() {
  const data = loadCommandCenterData();
  return <CommandCenterClient data={data} />;
}
