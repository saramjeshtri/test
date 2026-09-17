import fs from "node:fs";
import { PDFParse } from "pdf-parse";
import { STATUS_ALIASES } from "../dictionaries";
import type { RawTable } from "./types";

const PDF_HEADERS = ["Emer i plote", "Vendndodhja", "Lloji i problemit", "Data", "Gjendja", "Departamenti"];

// longest-first so "Ne vazhdim" isn't cut short by a shorter alias
const KNOWN_STATUS_PHRASES = Object.values(STATUS_ALIASES).flat().sort((a, b) => b.length - a.length);

function splitStatusAndDepartment(tail: string): { status: string; department: string } {
  for (const phrase of KNOWN_STATUS_PHRASES) {
    if (tail.startsWith(phrase)) {
      return { status: phrase, department: tail.slice(phrase.length).trim() };
    }
  }
  return { status: "", department: tail.trim() };
}

/**
 * PDF text extraction loses column boundaries -- rows come back as a single
 * line of space-joined text. We reconstruct fields by anchoring on the two
 * regex-identifiable tokens (the zone and the date), then splitting the
 * remainder after the date using the known status vocabulary. This approach
 * generalizes to any report where the target fields are drawn from a small,
 * known enum -- which is why STATUS_ALIASES lives in dictionaries.ts rather
 * than being hardcoded here.
 */
export async function parsePdf(path: string): Promise<RawTable> {
  const buffer = fs.readFileSync(path);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  const lines: string[] = result.text.split("\n").map((l: string) => l.trim()).filter(Boolean);

  const rows: Record<string, string>[] = [];
  for (const line of lines) {
    const zoneMatch = line.match(/Zona\s*\d/);
    const dateMatch = line.match(/\d{2}\/\d{2}\/\d{4}/);
    if (!zoneMatch || !dateMatch) continue; // title/paragraph/header row, skip

    const zoneIdx = line.indexOf(zoneMatch[0]);
    const dateIdx = line.indexOf(dateMatch[0]);
    if (dateIdx < zoneIdx) continue;

    const name = line.slice(0, zoneIdx).trim();
    const category = line.slice(zoneIdx + zoneMatch[0].length, dateIdx).trim();
    const tail = line.slice(dateIdx + dateMatch[0].length).trim();
    const { status, department } = splitStatusAndDepartment(tail);

    rows.push({
      "Emer i plote": name,
      Vendndodhja: zoneMatch[0].trim(),
      "Lloji i problemit": category,
      Data: dateMatch[0],
      Gjendja: status,
      Departamenti: department,
    });
  }

  return { headers: PDF_HEADERS, rows };
}
