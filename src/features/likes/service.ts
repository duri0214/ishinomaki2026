import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { likes, posts } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type LikeState = { liked: boolean; likeCount: number };

/**
 * いいねを「望む状態」に揃える。トグルではなく状態を送るので、連打や再送でも結果が変わらない。
 * 認証は呼び出し側で行い、ここでは認証済みの `userId` を受け取る。
 */
export async function setLike(
  db: Db,
  input: { userId: string; postId: string; liked: boolean },
): Promise<LikeState> {
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, input.postId), isNull(posts.deletedAt)))
    .limit(1);
  if (!post) throw new AppError("post_not_found", "投稿が見つかりません");

  if (input.liked) {
    await db
      .insert(likes)
      .values({ userId: input.userId, postId: input.postId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(likes)
      .where(
        and(eq(likes.userId, input.userId), eq(likes.postId, input.postId)),
      );
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.postId, input.postId));
  return { liked: input.liked, likeCount: Number(row?.count ?? 0) };
}
