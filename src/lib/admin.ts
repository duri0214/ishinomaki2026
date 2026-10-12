import "server-only";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export function isAdminUsername(username: string | null | undefined): boolean {
  return username?.toLowerCase().includes("admin") ?? false;
}

/** 管理機能は画面と Server Action の両方で同じ条件を検証する。 */
export async function requireAdminUser() {
  const user = await requireUser();
  if (!isAdminUsername(user.username)) {
    throw new AppError(
      "forbidden",
      "ユーザー名に admin を含むアカウントで利用できます",
    );
  }
  return user;
}
