import { and, asc, count, desc, eq, gte, isNull, max, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { posts, postTags, type Tag, tags } from "@/db/schema";

import { TOP_TAG_COUNT, TOP_TAG_WINDOW_DAYS } from "./constants";

export { TOP_TAG_COUNT, TOP_TAG_WINDOW_DAYS };

export async function getTagByNormalizedName(
  db: Db,
  islandId: string,
  normalizedName: string,
): Promise<Tag | undefined> {
  const [row] = await db
    .select()
    .from(tags)
    .where(
      and(eq(tags.islandId, islandId), eq(tags.normalizedName, normalizedName)),
    )
    .limit(1);
  return row;
}

export type RankedTag = {
  id: string;
  name: string;
  normalizedName: string;
  imageUrl: string | null;
  postCount: number;
};

/**
 * 島に並べる話題タグ: 直近7日間の投稿数の上位20件。
 * メンバータグと削除済みの投稿は含めない。同数なら最新の投稿が新しいタグを上にする。
 */
export async function getTopTopicTags(
  db: Db,
  islandId: string,
  now: Date = new Date(),
): Promise<RankedTag[]> {
  const since = new Date(
    now.getTime() - TOP_TAG_WINDOW_DAYS * 24 * 3600 * 1000,
  );
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      normalizedName: tags.normalizedName,
      imageUrl: tags.imageUrl,
      postCount: count(),
    })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(
      and(
        eq(tags.islandId, islandId),
        eq(tags.kind, "topic"),
        isNull(posts.deletedAt),
        // 返信はタイムラインに出ないので、タグの順位にも数えない
        isNull(posts.parentPostId),
        gte(posts.createdAt, since),
      ),
    )
    .groupBy(tags.id)
    .orderBy(desc(count()), desc(max(posts.createdAt)), asc(tags.id))
    .limit(TOP_TAG_COUNT);
  return rows;
}

export type MemberTag = {
  id: string;
  name: string;
  normalizedName: string;
  imageUrl: string | null;
  position: { x: number; y: number } | null;
};

export async function listMemberTags(
  db: Db,
  islandId: string,
): Promise<MemberTag[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      normalizedName: tags.normalizedName,
      imageUrl: tags.imageUrl,
      position: tags.position,
    })
    .from(tags)
    .where(and(eq(tags.islandId, islandId), eq(tags.kind, "member")))
    .orderBy(asc(tags.createdAt), asc(tags.normalizedName));
}

export type TagSearchResult = {
  name: string;
  normalizedName: string;
  kind: "member" | "topic";
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 島内のタグ検索（ヘッダーの検索と、投稿フォームの `#` 入力補助で使う）。
 * `normalizedQuery` は normalizeTagName 済みであること。前方一致を先に、部分一致を後に並べる。
 */
export async function searchTags(
  db: Db,
  islandId: string,
  normalizedQuery: string,
  limit: number,
): Promise<TagSearchResult[]> {
  const columns = {
    name: tags.name,
    normalizedName: tags.normalizedName,
    kind: tags.kind,
  };
  if (normalizedQuery === "") {
    return db
      .select(columns)
      .from(tags)
      .where(eq(tags.islandId, islandId))
      .orderBy(desc(tags.createdAt), asc(tags.id))
      .limit(limit);
  }
  const escaped = escapeLike(normalizedQuery);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;
  return db
    .select(columns)
    .from(tags)
    .where(
      and(
        eq(tags.islandId, islandId),
        sql`${tags.normalizedName} like ${contains} escape '\\'`,
      ),
    )
    .orderBy(
      sql`case when ${tags.normalizedName} like ${prefix} escape '\\' then 0 else 1 end`,
      sql`char_length(${tags.normalizedName})`,
      asc(tags.normalizedName),
    )
    .limit(limit);
}
