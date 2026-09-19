/**
 * Continuous severity → color gradient (forest green → earth brown →
 * critical rust), shared between the UI (ZoneList, etc.) and the
 * scripts/sync-map-values.ts script that colors the map's own zone cards --
 * one source of truth so both stay in sync.
 *
 * A fixed 3-bucket scheme (as used before) made every zone in our current
 * synthetic dataset look identical, since all six severity scores happen to
 * land in the same 50-74 middle bucket. Interpolating continuously means
 * two zones that differ by even a few points render visibly different
 * shades, which is what "colored by how much of an emergency they are"
 * actually requires.
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [45, 80, 22]], // forest #2D5016 -- calm
  [50, [139, 115, 85]], // earth brown #8B7355 -- attention
  [100, [166, 75, 63]], // critical rust #A64B3F -- emergency
];

/**
 * Colors are relative to `domain`, not a fixed 0-100 scale. A fixed scale
 * made every zone in our current synthetic dataset look the same brown,
 * since all six severity scores happen to land in the same 50-74 bucket.
 * Coloring by rank-within-the-observed-range instead means the most-at-risk
 * zones read as red and the calmest read as green *whatever* the data's
 * actual spread turns out to be -- including with the real Track D data.
 */
export function severityToRgb(score: number, domain: [number, number] = [0, 100]): [number, number, number] {
  const [dMin, dMax] = domain;
  const span = dMax - dMin || 1;
  const normalized = Math.max(0, Math.min(100, ((score - dMin) / span) * 100));

  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (normalized >= STOPS[i][0] && normalized <= STOPS[i + 1][0]) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const stopSpan = hi[0] - lo[0] || 1;
  const t = (normalized - lo[0]) / stopSpan;
  const [r0, g0, b0] = lo[1];
  const [r1, g1, b1] = hi[1];
  return [Math.round(r0 + (r1 - r0) * t), Math.round(g0 + (g1 - g0) * t), Math.round(b0 + (b1 - b0) * t)];
}

export function severityToColor(score: number, domain?: [number, number]): string {
  const [r, g, b] = severityToRgb(score, domain);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Domain to color a set of zones relative to each other. Pads a very tight
 *  natural spread to a minimum span so near-identical scores don't get
 *  exaggerated into a full green-to-red swing over noise. */
export function severityDomain(scores: number[]): [number, number] {
  if (scores.length === 0) return [0, 100];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const MIN_SPAN = 20;
  if (max - min < MIN_SPAN) {
    const mid = (min + max) / 2;
    return [mid - MIN_SPAN / 2, mid + MIN_SPAN / 2];
  }
  return [min, max];
}

export function severityLabel(score: number): string {
  if (score >= 75) return "Kritike";
  if (score >= 50) return "Vëmendje";
  return "Normale";
}
