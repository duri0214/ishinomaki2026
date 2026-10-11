import { AppError } from "./errors";

/**
 * 島エディタ(/dev/islands)はローカル専用。本番ビルド（Vercel の Preview も含む）では使えない。
 * ページだけでなく Server Action でも必ず確認する（Server Action は直接呼べる公開エンドポイントのため）。
 */
export function isDevEditorEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source.NODE_ENV !== "production";
}

export function assertDevEditor(): void {
  if (!isDevEditorEnabled()) {
    throw new AppError("forbidden", "この操作は開発環境でのみ使えます");
  }
}
