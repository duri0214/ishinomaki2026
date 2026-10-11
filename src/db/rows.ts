/** `db.execute()` の戻り値（ドライバごとに型が違う）から行の配列を取り出す */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}
