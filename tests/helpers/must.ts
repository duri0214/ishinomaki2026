/** `undefined` の場合にテストを失敗させて、非nullアサーションを避ける */
export function must<T>(value: T | undefined | null, what = "値"): T {
  if (value === undefined || value === null) {
    throw new Error(`${what}が見つかりません`);
  }
  return value;
}
