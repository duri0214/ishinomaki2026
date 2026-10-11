import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import {
  displayNameFromClerk,
  ensureUserFor,
  findUserByClerkId,
} from "@/features/users/service";
import { isClerkConfigured } from "./env";
import { AppError } from "./errors";

/** ログイン中の Clerk ユーザーID。未ログイン、または Clerk 未設定なら null */
export async function getClerkUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null;
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * 閲覧者の users.id（いいね済みの判定などに使う）。行がまだない、退会済み、未ログインなら null。
 * 閲覧だけでは users の行は作らない。
 */
export async function getViewerId(): Promise<string | null> {
  const clerkUserId = await getClerkUserId();
  if (!clerkUserId) return null;
  const user = await findUserByClerkId(await getDb(), clerkUserId);
  return user && !user.deletedAt ? user.id : null;
}

/** 書き込み系で使う。ログインしていなければ unauthorized。初回なら users の行を作る */
export async function requireUser(): Promise<{ id: string }> {
  const clerkUserId = await getClerkUserId();
  if (!clerkUserId) {
    throw new AppError("unauthorized", "ログインが必要です");
  }
  const user = await ensureUserFor(await getDb(), clerkUserId, async () => {
    const profile = await currentUser();
    return {
      displayName: displayNameFromClerk({
        username: profile?.username,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      }),
      avatarUrl: profile?.imageUrl ?? null,
    };
  });
  if (!user) throw new AppError("forbidden", "このアカウントは利用できません");
  return user;
}
