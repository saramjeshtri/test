export type CanonicalCategory = "road" | "lighting" | "water" | "waste" | "green" | "other";
export type CanonicalStatus = "resolved" | "in_progress" | "open";
export type CanonicalPriority = "low" | "medium" | "high";

export interface CanonicalRequest {
  request_id: string;
  citizen_name: string | null;
  zone_id: string | null; // "area-1".."area-6", matches public/data/areas.geojson
  category: CanonicalCategory | null;
  description: string | null;
  date_submitted: string | null; // ISO 8601 (YYYY-MM-DD)
  status: CanonicalStatus | null;
  priority: CanonicalPriority | null;
  cost_estimate_leke: number | null;
  department: string | null;
  source_system: string;
  source_row_ref: string; // for the "Evidence" drill-down back to the raw row
  /** e.g. "priority:unmapped" (source has no such column) or "date_submitted:unparsed"
   *  (source had a value but it didn't normalize) -- surfaced in the UI rather than hidden. */
  data_quality_flags: string[];
}

export const CANONICAL_FIELDS = [
  { field: "request_id", description: "Unique identifier for the request/complaint" },
  { field: "citizen_name", description: "Full name of the citizen who submitted the request" },
  { field: "zone_id", description: "Municipal zone/district/neighborhood reference" },
  { field: "category", description: "Type of issue: road, lighting, water, waste, green space, or other" },
  { field: "description", description: "Free-text description of the issue" },
  { field: "date_submitted", description: "Date the request was submitted" },
  { field: "status", description: "Current status: resolved, in progress, or open" },
  { field: "priority", description: "Priority/urgency level: low, medium, or high" },
  { field: "cost_estimate_leke", description: "Estimated cost in Albanian Leke, if tracked" },
  { field: "department", description: "Responsible municipal department, if tracked" },
] as const;

export const CANONICAL_FIELD_NAMES = CANONICAL_FIELDS.map((f) => f.field);
