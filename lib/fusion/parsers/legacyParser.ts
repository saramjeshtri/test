import fs from "node:fs";
import type { RawTable } from "./types";

/**
 * Legacy pipe-delimited export with no formal header row -- the field list
 * lives inside a "* FIELDS: A|B|C *" comment line instead. Everything else
 * that doesn't start with "*" is data.
 */
export function parseLegacy(path: string): RawTable {
  const lines = fs
    .readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const fieldsLine = lines.find((l) => l.startsWith("*") && l.includes("FIELDS:"));
  if (!fieldsLine) throw new Error("Legacy export is missing its '* FIELDS: ... *' header comment");

  const headers = fieldsLine
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .split("FIELDS:")[1]
    .trim()
    .split("|")
    .map((h) => h.trim());

  const dataLines = lines.filter((l) => !l.startsWith("*"));
  const rows = dataLines.map((line) => {
    const cells = line.split("|");
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });

  return { headers, rows };
}
