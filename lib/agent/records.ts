import type { CanonicalRequest } from "@/lib/fusion/schema";
import { CATEGORY_LABEL, PRIORITY_LABEL, SOURCE_SHORT, STATUS_LABEL, zoneLabel } from "@/lib/commandCenter/labels";
import type { Citation } from "./types";
import { truncate } from "./text";

/** A request as the model sees it: no citizen name, and a short handle (`ref`) to cite it by. */
export interface RecordView {
  ref: string;
  zone: string | null;
  category: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  date: string | null;
  costLeke: number | null;
  source: string;
}

const keyOf = (r: CanonicalRequest) => `${r.source_system}#${r.source_row_ref}`;

/**
 * Hands out short handles (R1, R2, ...) for the requests a run touches. The model cites these,
 * and only handles that were really handed out count as citations -- an invented one is dropped.
 * Request IDs can't serve as handles: they repeat across sources and one source has none.
 */
export class RefBook {
  private byKey = new Map<string, string>();
  private byRef = new Map<string, CanonicalRequest>();

  refFor(r: CanonicalRequest): string {
    const key = keyOf(r);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const ref = `R${this.byKey.size + 1}`;
    this.byKey.set(key, ref);
    this.byRef.set(ref, r);
    return ref;
  }

  has(ref: string): boolean {
    return this.byRef.has(ref);
  }

  view(r: CanonicalRequest): RecordView {
    return {
      ref: this.refFor(r),
      zone: r.zone_id ? zoneLabel(r.zone_id) : null,
      category: r.category ? CATEGORY_LABEL[r.category] : null,
      // Descriptions are typed by citizens: they reach the model as data and the prompt says so.
      description: truncate(r.description, 160),
      status: r.status ? STATUS_LABEL[r.status] : null,
      priority: r.priority ? PRIORITY_LABEL[r.priority] : null,
      date: r.date_submitted,
      costLeke: r.cost_estimate_leke,
      source: SOURCE_SHORT[r.source_system] ?? r.source_system,
    };
  }

  citation(ref: string): Citation | null {
    const r = this.byRef.get(ref);
    if (!r) return null;
    return {
      ref,
      zone: r.zone_id ? zoneLabel(r.zone_id) : null,
      category: r.category ? CATEGORY_LABEL[r.category] : null,
      description: r.description,
      status: r.status ? STATUS_LABEL[r.status] : null,
      priority: r.priority ? PRIORITY_LABEL[r.priority] : null,
      date: r.date_submitted,
      source: SOURCE_SHORT[r.source_system] ?? r.source_system,
      sourceRow: r.source_row_ref,
    };
  }
}
