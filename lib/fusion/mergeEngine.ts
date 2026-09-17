import { matchHeader } from "./fieldMatcher";
import { resolveUnmatchedHeaders } from "./llmFieldMatcher";
import * as norm from "./valueNormalizers";
import type { RawTable } from "./parsers/types";
import type { CanonicalRequest } from "./schema";

export interface SourceInput {
  sourceSystem: string;
  table: RawTable;
}

export interface HeaderMappingResult {
  sourceHeader: string;
  canonicalField: string | null;
  confidence: number;
  method: "exact" | "fuzzy" | "llm" | "unmatched";
}

export interface FusionResult {
  records: CanonicalRequest[];
  mappingReport: Record<string, HeaderMappingResult[]>;
}

/** Resolves every header in one source table to a canonical field:
 *  deterministic matcher first, LLM fallback only for what's left unmatched. */
async function resolveHeaders(table: RawTable): Promise<{
  headerToField: Record<string, string>;
  mapping: HeaderMappingResult[];
}> {
  const headerToField: Record<string, string> = {};
  const mapping: HeaderMappingResult[] = [];
  const unmatched: { header: string; sampleValues: string[] }[] = [];

  for (const header of table.headers) {
    const m = matchHeader(header);
    if (m.canonicalField) {
      headerToField[header] = m.canonicalField;
      mapping.push({ ...m, method: m.method });
    } else {
      unmatched.push({
        header,
        sampleValues: table.rows.slice(0, 3).map((r) => r[header]).filter(Boolean),
      });
    }
  }

  if (unmatched.length > 0) {
    const llmResults = await resolveUnmatchedHeaders(unmatched);
    for (const header of Object.keys(llmResults)) {
      const field = llmResults[header];
      if (field) {
        headerToField[header] = field;
        mapping.push({ sourceHeader: header, canonicalField: field, confidence: 0.6, method: "llm" });
      } else {
        mapping.push({ sourceHeader: header, canonicalField: null, confidence: 0, method: "unmatched" });
      }
    }
  }

  return { headerToField, mapping };
}

function fieldToHeader(headerToField: Record<string, string>, field: string): string | undefined {
  return Object.keys(headerToField).find((h) => headerToField[h] === field);
}

export async function fuseSource(
  input: SourceInput
): Promise<{ records: CanonicalRequest[]; mapping: HeaderMappingResult[] }> {
  const { sourceSystem, table } = input;
  const { headerToField, mapping } = await resolveHeaders(table);

  const records: CanonicalRequest[] = table.rows.map((row, i) => {
    const flags: string[] = [];

    const readRaw = (field: string): string | undefined => {
      const header = fieldToHeader(headerToField, field);
      return header ? row[header] : undefined;
    };

    /** For fields that pass through as plain strings (no normalization needed) --
     *  still flags when the source doesn't track this field at all. */
    const readPassthrough = (field: string): string | null => {
      const raw = readRaw(field);
      if (raw === undefined) {
        flags.push(`${field}:unmapped`);
        return null;
      }
      return raw || null;
    };

    const resolveField = <T>(
      field: string,
      normalizer: (raw: string) => T | null
    ): T | null => {
      const raw = readRaw(field);
      if (raw === undefined) {
        flags.push(`${field}:unmapped`); // this source doesn't track this field at all
        return null;
      }
      const value = normalizer(raw);
      if (value === null) flags.push(`${field}:unparsed`); // had a value, couldn't normalize it
      return value;
    };

    const idRaw = readRaw("request_id");
    if (idRaw === undefined) flags.push("request_id:unmapped");

    return {
      request_id: idRaw || `${sourceSystem}-row${i + 1}`,
      citizen_name: readPassthrough("citizen_name"),
      zone_id: resolveField("zone_id", norm.resolveZoneId),
      category: resolveField("category", norm.resolveCategory),
      description: readPassthrough("description"),
      date_submitted: resolveField("date_submitted", norm.parseDateFlexible),
      status: resolveField("status", norm.resolveStatus),
      priority: resolveField("priority", norm.resolvePriority),
      cost_estimate_leke: resolveField("cost_estimate_leke", norm.parseCost),
      department: readPassthrough("department"),
      source_system: sourceSystem,
      source_row_ref: `${sourceSystem}#row${i + 1}`,
      data_quality_flags: flags,
    };
  });

  return { records, mapping };
}

export async function fuseAll(inputs: SourceInput[]): Promise<FusionResult> {
  const mappingReport: Record<string, HeaderMappingResult[]> = {};
  const records: CanonicalRequest[] = [];

  for (const input of inputs) {
    const result = await fuseSource(input);
    mappingReport[input.sourceSystem] = result.mapping;
    records.push(...result.records);
  }

  return { records, mappingReport };
}
