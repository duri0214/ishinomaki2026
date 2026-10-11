import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { users } from "@/db/schema";

export type ClerkProfile = {
  clerkUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

export const FALLBACK_DISPLAY_NAME = "ユーザー";
const MAX_DISPLAY_NAME_LENGTH = 50;

/** Clerk のプロフィールから表示名を決める: ユーザー名 → 姓名 → 既定値 */
export function displayNameFromClerk(profile: {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const full = [profile.lastName, profile.firstName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  const name = profile.username?.trim() || full || FALLBACK_DISPLAY_NAME;
  return Array.from(name).slice(0, MAX_DISPLAY_NAME_LENGTH).join("");
}

/** Clerk のユーザーに対応する users の行を作る（既にあれば表示名とアバターを更新する） */
export async function upsertUser(
  db: Db,
  profile: ClerkProfile,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values(profile)
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: users.id });
  if (!row) throw new Error("ユーザーの保存に失敗しました");
  return row;
}

export async function findUserByClerkId(
  db: Db,
  clerkUserId: string,
): Promise<{ id: string; deletedAt: Date | null } | undefined> {
  const [row] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row;
}

/** 退会したユーザーを論理削除する。投稿は残り、作者は「退会したユーザー」と表示される */
export async function softDeleteUserByClerkId(
  db: Db,
  clerkUserId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ deletedAt: sql`now()`, avatarUrl: null })
    .where(eq(users.clerkUserId, clerkUserId));
}

/**
 * ログイン中の Clerk ユーザーに対応する users の行を返す。無ければ作る（初回の投稿・いいね時）。
 * 既に行があるときは Clerk に問い合わせない。退会済みなら null。
 */
export async function ensureUserFor(
  db: Db,
  clerkUserId: string,
  fetchProfile: () => Promise<Omit<ClerkProfile, "clerkUserId">>,
): Promise<{ id: string } | null> {
  const existing = await findUserByClerkId(db, clerkUserId);
  if (existing) return existing.deletedAt ? null : { id: existing.id };
  const profile = await fetchProfile();
  return upsertUser(db, { clerkUserId, ...profile });
}
