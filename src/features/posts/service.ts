import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { posts, postTags, tags } from "@/db/schema";
import { getIslandBySlug } from "@/features/islands/queries";
import { parseHashtags } from "@/features/tags/parse";
import { AppError } from "@/lib/errors";
import { createPostInputSchema } from "@/lib/validation";

/**
 * 投稿を作る。本文を解析して、存在しないタグは作り、post_tags を登録する。
 * 全体を1つのトランザクションで行う（`txDb` は transaction() が使える接続）。
 * 認証は呼び出し側(Server Action)で行い、ここでは認証済みの `userId` を受け取る。
 */
export async function createPost(
  txDb: Db,
  input: { userId: string; islandSlug: string; body: string },
): Promise<{ postId: string }> {
  const parsed = createPostInputSchema.safeParse({
    islandSlug: input.islandSlug,
    body: input.body,
  });
  if (!parsed.success) {
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "入力が不正です",
    );
  }
  const { islandSlug, body } = parsed.data;
  const { tags: parsedTags } = parseHashtags(body);

  return txDb.transaction(async (tx) => {
    const island = await getIslandBySlug(tx, islandSlug);
    if (!island) throw new AppError("island_not_found", "島が見つかりません");

    const [post] = await tx
      .insert(posts)
      .values({ islandId: island.id, authorId: input.userId, body })
      .returning({ id: posts.id });
    if (!post) throw new Error("投稿の作成に失敗しました");

    if (parsedTags.length > 0) {
      // 既存のタグ（メンバータグを含む）はそのまま使い、無ければ話題タグとして作る
      await tx
        .insert(tags)
        .values(
          parsedTags.map((t) => ({
            islandId: island.id,
            name: t.name,
            normalizedName: t.normalizedName,
            kind: "topic" as const,
          })),
        )
        .onConflictDoNothing({ target: [tags.islandId, tags.normalizedName] });

      const rows = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.islandId, island.id),
            inArray(
              tags.normalizedName,
              parsedTags.map((t) => t.normalizedName),
            ),
          ),
        );
      if (rows.length > 0) {
        await tx
          .insert(postTags)
          .values(rows.map((r) => ({ postId: post.id, tagId: r.id })))
          .onConflictDoNothing();
      }
    }
    return { postId: post.id };
  });
}

/**
 * 自分の投稿を論理削除する。作者の条件を WHERE に含めるので、他人の投稿は消せない。
 * 対象がない・他人の投稿・削除済みのときは、区別せず同じエラーにする。
 */
export async function deletePost(
  db: Db,
  input: { userId: string; postId: string },
): Promise<void> {
  const rows = await db
    .update(posts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(posts.id, input.postId),
        eq(posts.authorId, input.userId),
        isNull(posts.deletedAt),
      ),
    )
    .returning({ id: posts.id });
  if (rows.length === 0) {
    throw new AppError("post_not_found", "投稿が見つかりません");
  }
}
