/**
 * Proves the LLM-fallback wiring (prompt building, response parsing, merge
 * back into the header map) works mechanically, using a mock provider --
 * without needing a real API key. None of our current fixture headers reach
 * this path (the deterministic dictionary covers them all), so this is the
 * only place that path gets exercised until real, genuinely novel headers
 * show up in the Track D data package at the event.
 */
import { resolveUnmatchedHeaders } from "../lib/fusion/llmFieldMatcher";

async function mockProvider(): Promise<string> {
  return JSON.stringify({
    Qytetari_Raportues: "citizen_name",
    Kodi_Zones: "zone_id",
    Kolona_E_Panjohur: null,
  });
}

async function main() {
  const unmatched = [
    { header: "Qytetari_Raportues", sampleValues: ["Arben Hoxha", "Elira Meta"] },
    { header: "Kodi_Zones", sampleValues: ["Z3", "Z5"] },
    { header: "Kolona_E_Panjohur", sampleValues: ["x", "y"] },
  ];

  const result = await resolveUnmatchedHeaders(unmatched, mockProvider);
  console.log("Mock LLM fallback result:", result);

  const ok =
    result["Qytetari_Raportues"] === "citizen_name" &&
    result["Kodi_Zones"] === "zone_id" &&
    result["Kolona_E_Panjohur"] === null;

  console.log(ok ? "PASS -- LLM fallback wiring works" : "FAIL -- unexpected mapping");
  process.exit(ok ? 0 : 1);
}

main();
