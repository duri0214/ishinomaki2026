import { and, desc, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { islands, posts, postTags, users } from "@/db/schema";
import { type Cursor, encodeCursor } from "@/lib/cursor";

export type TimelineScope =
  | { kind: "all" }
  | { kind: "island"; islandId: string }
  | { kind: "tag"; islandId: string; tagId: string };

export type TimelinePost = {
  id: string;
  body: string;
  /** ISO 8601 */
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  island: { slug: string; name: string };
  likeCount: number;
  likedByMe: boolean;
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
      createdAt: posts.createdAt,
      authorId: users.id,
      authorName: users.displayName,
      authorAvatar: users.avatarUrl,
      authorDeletedAt: users.deletedAt,
      islandSlug: islands.slug,
      islandName: islands.name,
      likeCount: sql<number>`(select count(*)::int from likes where likes.post_id = ${posts.id})`,
      likedByMe: viewerId
        ? sql<boolean>`exists (select 1 from likes where likes.post_id = ${posts.id} and likes.user_id = ${viewerId})`
        : sql<boolean>`false`,
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
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.authorId,
      displayName: deleted ? DELETED_USER_NAME : row.authorName,
      avatarUrl: deleted ? null : row.authorAvatar,
    },
    island: { slug: row.islandSlug, name: row.islandName },
    likeCount: Number(row.likeCount),
    likedByMe: Boolean(row.likedByMe),
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
