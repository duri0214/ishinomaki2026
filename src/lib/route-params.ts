/**
 * ルートの動的パラメータ（例: /i/x/t/%E3%83%A9...）を元の文字列に戻す。
 * タグ名に `%` は使えないので、`%` を含むときだけ1回デコードする（二重デコードを避ける）。
 */
export function decodeRouteParam(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
