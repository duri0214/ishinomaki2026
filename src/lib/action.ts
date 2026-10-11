import { AppError, type AppErrorCode } from "./errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AppErrorCode | "internal"; message: string };

/** Server Action の本体を実行し、想定内のエラー(AppError)は結果として返す */
export async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("Server Action failed:", err);
    return {
      ok: false,
      code: "internal",
      message: "うまくいきませんでした。時間をおいてもう一度お試しください",
    };
  }
}
