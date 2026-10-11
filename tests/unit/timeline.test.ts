import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { postTags } from "@/db/schema";
import {
  getTimeline,
  getTimelinePost,
  type TimelineScope,
} from "@/features/timeline/queries";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { createTestDb } from "../helpers/db";
import {
  insertIsland,
  insertPost,
  insertTag,
  insertUser,
} from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

/** 全ページを順にたどって投稿IDを集める */
async function collect(scope: TimelineScope, limit: number) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await getTimeline(conn.db, {
      scope,
      limit,
      viewerId: null,
      cursor: cursor ? (decodeCursor(cursor) ?? undefined) : undefined,
    });
    ids.push(...page.posts.map((p) => p.id));
    cursor = page.nextCursor;
    pages++;
    expect(pages).toBeLessThan(100);
  } while (cursor);
  return ids;
}

describe("カーソル", () => {
  it("往復しても同じ値になる", () => {
    const cursor = {
      createdAt: new Date("2026-10-11T01:02:03.456Z"),
      id: "0b6f2c9e-5d39-4d5e-9a49-1d4c6d0b7a11",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });
  it("不正な文字列は null", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(
      decodeCursor(Buffer.from('{"t":"x","i":"y"}').toString("base64url")),
    ).toBeNull();
  });
});

describe("タイムライン取得とページング", () => {
  it("全島・島・島＋タグの3種類で、重複も抜けもなく新しい順に並ぶ", async () => {
    const a = await insertIsland(conn.db);
    const b = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const tagA = await insertTag(conn.db, a.id, "tagA");

    const base = new Date("2026-10-01T00:00:00.000Z").getTime();
    const created: { id: string; islandId: string; at: number }[] = [];
    // 同じミリ秒に複数の投稿が入る状況を作る（3件ずつ同時刻）
    for (let i = 0; i < 40; i++) {
      const islandId = i % 3 === 0 ? b.id : a.id;
      const at = base + Math.floor(i / 3) * 1000;
      const p = await insertPost(conn.db, {
        islandId,
        authorId: user.id,
        body: `post ${i}`,
        createdAt: new Date(at),
      });
      created.push({ id: p.id, islandId, at });
      if (islandId === a.id && i % 2 === 0) {
        await conn.db.insert(postTags).values({ postId: p.id, tagId: tagA.id });
      }
    }
    // 削除済みは出ない
    const deleted = await insertPost(conn.db, {
      islandId: a.id,
      authorId: user.id,
      createdAt: new Date(base + 99_000),
      deletedAt: new Date(),
    });

    const sortKey = (x: { id: string; at: number }) => x;
    const expected = (filter: (c: (typeof created)[number]) => boolean) =>
      created
        .filter(filter)
        .map(sortKey)
        .sort((x, y) => y.at - x.at || (x.id < y.id ? 1 : -1))
        .map((c) => c.id);

    for (const limit of [1, 7, 20, 50]) {
      const all = await collect({ kind: "all" }, limit);
      expect(all).not.toContain(deleted.id);
      // 他のテストで作った投稿が混ざらないよう、このテストの投稿だけで比較する
      const mine = all.filter((id) => created.some((c) => c.id === id));
      expect(mine).toEqual(expected(() => true));
      expect(new Set(all).size).toBe(all.length);

      const island = await collect({ kind: "island", islandId: a.id }, limit);
      expect(island).toEqual(expected((c) => c.islandId === a.id));

      const tag = await collect(
        { kind: "tag", islandId: a.id, tagId: tagA.id },
        limit,
      );
      const taggedIds = new Set(
        (await conn.db.select({ id: postTags.postId }).from(postTags)).map(
          (r) => r.id,
        ),
      );
      expect(tag).toEqual(
        expected((c) => c.islandId === a.id && taggedIds.has(c.id)),
      );
    }
  });

  it("limit ちょうどの件数のときは次ページなし", async () => {
    const isl = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    for (let i = 0; i < 3; i++) {
      await insertPost(conn.db, {
        islandId: isl.id,
        authorId: user.id,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      });
    }
    const page = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: isl.id },
      limit: 3,
      viewerId: null,
    });
    expect(page.posts).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it("いいね数・自分がいいね済みか・自分の投稿かを返す", async () => {
    const isl = await insertIsland(conn.db);
    const me = await insertUser(conn.db);
    const other = await insertUser(conn.db);
    const mine = await insertPost(conn.db, {
      islandId: isl.id,
      authorId: me.id,
    });
    const theirs = await insertPost(conn.db, {
      islandId: isl.id,
      authorId: other.id,
      createdAt: new Date(Date.now() - 10_000),
    });
    const { likes } = await import("@/db/schema");
    await conn.db.insert(likes).values([
      { userId: me.id, postId: theirs.id },
      { userId: other.id, postId: theirs.id },
    ]);

    const asMe = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: isl.id },
      limit: 10,
      viewerId: me.id,
    });
    const byId = new Map(asMe.posts.map((p) => [p.id, p]));
    expect(byId.get(theirs.id)).toMatchObject({
      likeCount: 2,
      likedByMe: true,
      isMine: false,
    });
    expect(byId.get(mine.id)).toMatchObject({
      likeCount: 0,
      likedByMe: false,
      isMine: true,
    });

    const anonymous = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: isl.id },
      limit: 10,
      viewerId: null,
    });
    expect(anonymous.posts.every((p) => !p.likedByMe && !p.isMine)).toBe(true);
  });

  it("退会したユーザーの投稿は作者名を伏せる", async () => {
    const isl = await insertIsland(conn.db);
    const user = await insertUser(conn.db, "secret-name");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await conn.db
      .update(users)
      .set({ deletedAt: new Date(), avatarUrl: "https://example.com/a.png" })
      .where(eq(users.id, user.id));
    const p = await insertPost(conn.db, {
      islandId: isl.id,
      authorId: user.id,
    });
    const got = must(await getTimelinePost(conn.db, p.id, null));
    expect(got.author.displayName).toBe("退会したユーザー");
    expect(got.author.avatarUrl).toBeNull();
  });
});
