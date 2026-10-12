import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { userFollows, users } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type FollowStats = {
  followerCount: number;
  followingCount: number;
  /** 閲覧者がこのユーザーをフォローしているか。未ログイン・本人なら false */
  followedByMe: boolean;
};

export type FollowListUser = {
  id: string;
  username: string;
  displayName: string;
};

export type FollowListKind = "followers" | "following";

/**
 * フォローを「望む状態」に揃える。トグルではなく状態を送るので、連打や再送でも結果が変わらない。
 * 認証は呼び出し側で行い、ここでは認証済みの `followerId` を受け取る。
 */
export async function setFollow(
  db: Db,
  input: { followerId: string; followeeId: string; following: boolean },
): Promise<{ following: boolean; followerCount: number }> {
  if (input.followerId === input.followeeId) {
    throw new AppError("validation", "自分自身はフォローできません");
  }
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.followeeId), isNull(users.deletedAt)))
    .limit(1);
  // 解除は退会済みの相手にもできるようにしておく（残った行を消せるように）
  if (!target && input.following) {
    throw new AppError("user_not_found", "ユーザーが見つかりません");
  }

  if (input.following) {
    await db
      .insert(userFollows)
      .values({ followerId: input.followerId, followeeId: input.followeeId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerId, input.followerId),
          eq(userFollows.followeeId, input.followeeId),
        ),
      );
  }
  const { followerCount } = await getFollowStats(db, input.followeeId, null);
  return { following: input.following, followerCount };
}

/** フォロー数・フォロワー数（退会済みユーザーは数えない）と、閲覧者がフォロー済みか */
export async function getFollowStats(
  db: Db,
  userId: string,
  viewerId: string | null,
): Promise<FollowStats> {
  const [followers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followerId))
    .where(and(eq(userFollows.followeeId, userId), isNull(users.deletedAt)));
  const [following] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followeeId))
    .where(and(eq(userFollows.followerId, userId), isNull(users.deletedAt)));
  let followedByMe = false;
  if (viewerId && viewerId !== userId) {
    const [row] = await db
      .select({ id: userFollows.followeeId })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, viewerId),
          eq(userFollows.followeeId, userId),
        ),
      )
      .limit(1);
    followedByMe = row !== undefined;
  }
  return {
    followerCount: Number(followers?.count ?? 0),
    followingCount: Number(following?.count ?? 0),
    followedByMe,
  };
}

/** フォロワー／フォロー中の一覧。新しくフォローした順。退会済みユーザーは除く */
export async function listFollows(
  db: Db,
  userId: string,
  kind: FollowListKind,
): Promise<FollowListUser[]> {
  const [mine, other] =
    kind === "followers"
      ? [userFollows.followeeId, userFollows.followerId]
      : [userFollows.followerId, userFollows.followeeId];
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, other))
    .where(and(eq(mine, userId), isNull(users.deletedAt)))
    .orderBy(desc(userFollows.createdAt), asc(users.username));
}
