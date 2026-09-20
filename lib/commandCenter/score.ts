// Kept apart from aggregate.ts (which reads files on the server) so browser code can use it too.

/**
 * Explainable heuristic, not a prediction: 60% weight on how much of a zone's caseload is still
 * open or in progress, 40% on how much of its budget is already spent (less room left to respond).
 * Shared with the work plan, so a zone "after the plan" is scored exactly like a real one.
 */
export function scoreSeverity(pending: number, total: number, spentPct: number | null): number {
  const backlogRatio = total ? pending / total : 0;
  const budgetPressure = spentPct !== null ? spentPct / 100 : 0.5;
  return Math.round(Math.min(100, backlogRatio * 60 + budgetPressure * 40));
}
