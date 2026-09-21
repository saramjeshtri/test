/** Lower-case and strip diacritics, so "zhurmë" finds "Zhurme" and "Rrugë" finds "rruge". */
export const fold = (t: string): string => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function truncate(t: string | null | undefined, max: number): string | null {
  if (t == null) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
