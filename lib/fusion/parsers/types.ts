/** A parsed source table: original headers, plus rows keyed by original header string. */
export interface RawTable {
  headers: string[];
  rows: Record<string, string>[];
}
