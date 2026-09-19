export const MONTH_NAMES = [
  "Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor",
  "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor",
];

/** "2026-03" -> "Mars" (name only), or "Mars 2026" with `withYear`. */
export function monthName(month: string, withYear = false): string {
  const [year, m] = month.split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  if (!name) return month;
  return withYear ? `${name} ${year}` : name;
}
