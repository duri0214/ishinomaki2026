import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { posts, postTags, tags } from "@/db/schema";
import { getIslandBySlug } from "@/features/islands/queries";
import { parseHashtags } from "@/features/tags/parse";
import { AppError } from "@/lib/errors";
import {
  createPostInputSchema,
  createReplyInputSchema,
} from "@/lib/validation";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * 投稿(返信を含む)を1件追加し、本文のハッシュタグを登録する。トランザクションの中で呼ぶ。
 * 既存のタグ(メンバータグを含む)はそのまま使い、無ければ話題タグとして作る。
 */
async function insertPostWithTags(
  tx: Tx,
  input: {
    islandId: string;
    authorId: string;
    body: string;
    parentPostId: string | null;
  },
): Promise<{ postId: string }> {
  const { tags: parsedTags } = parseHashtags(input.body);
  const [post] = await tx
    .insert(posts)
    .values({
      islandId: input.islandId,
      authorId: input.authorId,
      body: input.body,
      parentPostId: input.parentPostId,
    })
    .returning({ id: posts.id });
  if (!post) throw new Error("投稿の作成に失敗しました");

  if (parsedTags.length > 0) {
    await tx
      .insert(tags)
      .values(
        parsedTags.map((t) => ({
          islandId: input.islandId,
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
          eq(tags.islandId, input.islandId),
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
}

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

  return txDb.transaction(async (tx) => {
    const island = await getIslandBySlug(tx, islandSlug);
    if (!island) throw new AppError("island_not_found", "島が見つかりません");
    return insertPostWithTags(tx, {
      islandId: island.id,
      authorId: input.userId,
      body,
      parentPostId: null,
    });
  });
}

/**
 * 投稿に返信する。返信は島を返信先と同じにし、タグなど本文のルールは通常の投稿と同じ。
 * 返信への返信は、その返信の元の投稿に付ける（階層は1段まで）。
 * 返信先(または元の投稿)が無い・削除済みのときは `post_not_found`。
 */
export async function createReply(
  txDb: Db,
  input: { userId: string; parentPostId: string; body: string },
): Promise<{ postId: string }> {
  const parsed = createReplyInputSchema.safeParse({
    parentPostId: input.parentPostId,
    body: input.body,
  });
  if (!parsed.success) {
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "入力が不正です",
    );
  }
  const { parentPostId, body } = parsed.data;

  return txDb.transaction(async (tx) => {
    const target = await findLivePost(tx, parentPostId);
    if (!target) throw new AppError("post_not_found", "投稿が見つかりません");

    let root = target;
    if (target.parentPostId) {
      const found = await findLivePost(tx, target.parentPostId);
      if (!found) throw new AppError("post_not_found", "投稿が見つかりません");
      root = found;
    }
    return insertPostWithTags(tx, {
      islandId: root.islandId,
      authorId: input.userId,
      body,
      parentPostId: root.id,
    });
  });
}

async function findLivePost(db: Tx | Db, postId: string) {
  const [row] = await db
    .select({
      id: posts.id,
      islandId: posts.islandId,
      parentPostId: posts.parentPostId,
    })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  return row;
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
