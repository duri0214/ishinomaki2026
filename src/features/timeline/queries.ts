import { and, asc, desc, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { islands, postImages, posts, postTags, users } from "@/db/schema";
import type { PostImage } from "@/features/posts/image-limits";
import { type Cursor, encodeCursor } from "@/lib/cursor";

export type TimelineScope =
  | { kind: "all" }
  | { kind: "island"; islandId: string }
  | { kind: "tag"; islandId: string; tagId: string };

export type TimelinePost = {
  id: string;
  body: string;
  images?: PostImage[];
  /** ISO 8601 */
  createdAt: string;
  author: {
    id: string;
    /** 退会済みなら null（プロフィールへリンクしない） */
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  island: { slug: string; name: string };
  likeCount: number;
  likedByMe: boolean;
  /** 削除されていない返信の数 */
  replyCount: number;
  /** 自分の投稿か（削除ボタンの表示に使う） */
  isMine: boolean;
};

export type TimelinePage = {
  posts: TimelinePost[];
  nextCursor: string | null;
};

const DELETED_USER_NAME = "退会したユーザー";

function selectPosts(db: Db, viewerId: string | null) {
  return db
    .select({
      id: posts.id,
      body: posts.body,
      images: sql<
        PostImage[]
      >`coalesce((select json_agg(json_build_object('url', pi.url, 'width', pi.width, 'height', pi.height) order by pi.position) from ${postImages} pi where pi.post_id = ${posts.id}), '[]'::json)`,
      createdAt: posts.createdAt,
      authorId: users.id,
      authorUsername: users.username,
      authorName: users.displayName,
      authorAvatar: users.avatarUrl,
      authorDeletedAt: users.deletedAt,
      islandSlug: islands.slug,
      islandName: islands.name,
      likeCount: sql<number>`(select count(*)::int from likes where likes.post_id = ${posts.id})`,
      likedByMe: viewerId
        ? sql<boolean>`exists (select 1 from likes where likes.post_id = ${posts.id} and likes.user_id = ${viewerId})`
        : sql<boolean>`false`,
      // 内側の posts は別名にする（外側の posts.id と取り違えないため）
      replyCount: sql<number>`(select count(*)::int from posts as r where r.parent_post_id = ${posts.id} and r.deleted_at is null)`,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .innerJoin(islands, eq(islands.id, posts.islandId));
}

type Row = Awaited<ReturnType<ReturnType<typeof selectPosts>["limit"]>>[number];

function toTimelinePost(row: Row, viewerId: string | null): TimelinePost {
  const deleted = row.authorDeletedAt !== null;
  return {
    id: row.id,
    body: row.body,
    images: row.images,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.authorId,
      username: deleted ? null : row.authorUsername,
      displayName: deleted ? DELETED_USER_NAME : row.authorName,
      avatarUrl: deleted ? null : row.authorAvatar,
    },
    island: { slug: row.islandSlug, name: row.islandName },
    likeCount: Number(row.likeCount),
    likedByMe: Boolean(row.likedByMe),
    replyCount: Number(row.replyCount),
    isMine: viewerId !== null && row.authorId === viewerId,
  };
}

function scopeCondition(scope: TimelineScope): SQL | undefined {
  switch (scope.kind) {
    case "all":
      return undefined;
    case "island":
      return eq(posts.islandId, scope.islandId);
    case "tag":
      return and(
        eq(posts.islandId, scope.islandId),
        sql`exists (select 1 from ${postTags} where ${postTags.postId} = ${posts.id} and ${postTags.tagId} = ${scope.tagId})`,
      );
  }
}

/** (created_at, id) の降順で、カーソルより古いものだけ */
function cursorCondition(cursor: Cursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(posts.createdAt, cursor.createdAt),
    and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
  );
}

export async function getTimeline(
  db: Db,
  options: {
    scope: TimelineScope;
    cursor?: Cursor;
    limit: number;
    viewerId: string | null;
  },
): Promise<TimelinePage> {
  const { scope, cursor, limit, viewerId } = options;
  const rows = await selectPosts(db, viewerId)
    .where(
      and(
        isNull(posts.deletedAt),
        // 返信はタイムラインに流さず、元の投稿のスレッドにだけ表示する
        isNull(posts.parentPostId),
        scopeCondition(scope),
        cursorCondition(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    posts: page.map((r) => toTimelinePost(r, viewerId)),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

export async function getTimelinePost(
  db: Db,
  postId: string,
  viewerId: string | null,
): Promise<TimelinePost | undefined> {
  const [row] = await selectPosts(db, viewerId)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  return row ? toTimelinePost(row, viewerId) : undefined;
}

/** 1つの投稿に表示する返信の上限(古い順に先頭から) */
export const MAX_REPLIES = 100;

/**
 * 投稿への返信を古い順に返す。元の投稿が無い・削除済みなら空。
 * 削除済みの返信と、退会済みユーザーの表示のしかたは通常の投稿と同じ。
 */
export async function getReplies(
  db: Db,
  postId: string,
  viewerId: string | null,
): Promise<TimelinePost[]> {
  const [parent] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  if (!parent) return [];
  const rows = await selectPosts(db, viewerId)
    .where(and(eq(posts.parentPostId, postId), isNull(posts.deletedAt)))
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(MAX_REPLIES);
  return rows.map((r) => toTimelinePost(r, viewerId));
}
