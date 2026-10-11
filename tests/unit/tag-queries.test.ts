import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { postTags } from "@/db/schema";
import {
  getTagByNormalizedName,
  getTopTopicTags,
  listMemberTags,
  searchTags,
  TOP_TAG_COUNT,
} from "@/features/tags/queries";
import { createTestDb } from "../helpers/db";
import {
  insertIsland,
  insertPost,
  insertTag,
  insertUser,
} from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;
const NOW = new Date("2026-10-11T12:00:00.000Z");
const daysAgo = (d: number, extraMs = 0) =>
  new Date(NOW.getTime() - d * 24 * 3600 * 1000 + extraMs);

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

async function tagPost(
  islandId: string,
  authorId: string,
  tagIds: string[],
  createdAt: Date,
  deletedAt: Date | null = null,
) {
  const post = await insertPost(conn.db, {
    islandId,
    authorId,
    createdAt,
    deletedAt,
  });
  await conn.db
    .insert(postTags)
    .values(tagIds.map((tagId) => ({ postId: post.id, tagId })));
  return post;
}

describe("getTopTopicTags", () => {
  it("投稿数の多い順に並べ、7日より前の投稿は数えない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const a = await insertTag(conn.db, island.id, "a");
    const b = await insertTag(conn.db, island.id, "b");
    const c = await insertTag(conn.db, island.id, "c");
    // a: 直近2件 / b: 直近3件 / c: 8日前のみ
    await tagPost(island.id, user.id, [a.id], daysAgo(1));
    await tagPost(island.id, user.id, [a.id], daysAgo(2));
    await tagPost(island.id, user.id, [b.id], daysAgo(1));
    await tagPost(island.id, user.id, [b.id], daysAgo(3));
    await tagPost(island.id, user.id, [b.id], daysAgo(6));
    await tagPost(island.id, user.id, [c.id], daysAgo(8));
    const top = await getTopTopicTags(conn.db, island.id, NOW);
    expect(top.map((t) => [t.normalizedName, t.postCount])).toEqual([
      ["b", 3],
      ["a", 2],
    ]);
  });

  it("ちょうど7日前の投稿は含み、それより1ms古い投稿は含まない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const edge = await insertTag(conn.db, island.id, "edge");
    const old = await insertTag(conn.db, island.id, "old");
    await tagPost(island.id, user.id, [edge.id], daysAgo(7));
    await tagPost(island.id, user.id, [old.id], daysAgo(7, -1));
    const top = await getTopTopicTags(conn.db, island.id, NOW);
    expect(top.map((t) => t.normalizedName)).toEqual(["edge"]);
  });

  it("削除済みの投稿とメンバータグ、他の島の投稿は集計に含めない", async () => {
    const island = await insertIsland(conn.db);
    const other = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const topic = await insertTag(conn.db, island.id, "topic");
    const member = await insertTag(conn.db, island.id, "member1", "member");
    const otherTopic = await insertTag(conn.db, other.id, "elsewhere");
    await tagPost(island.id, user.id, [topic.id, member.id], daysAgo(1));
    await tagPost(
      island.id,
      user.id,
      [topic.id],
      daysAgo(1),
      new Date(NOW.getTime()),
    );
    await tagPost(other.id, user.id, [otherTopic.id], daysAgo(1));
    const top = await getTopTopicTags(conn.db, island.id, NOW);
    expect(top.map((t) => [t.normalizedName, t.postCount])).toEqual([
      ["topic", 1],
    ]);
  });

  it("同数のときは最新の投稿が新しいタグが上", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const older = await insertTag(conn.db, island.id, "older");
    const newer = await insertTag(conn.db, island.id, "newer");
    await tagPost(island.id, user.id, [older.id], daysAgo(3));
    await tagPost(island.id, user.id, [newer.id], daysAgo(1));
    await tagPost(island.id, user.id, [older.id], daysAgo(2));
    await tagPost(island.id, user.id, [newer.id], daysAgo(4));
    const top = await getTopTopicTags(conn.db, island.id, NOW);
    expect(top.map((t) => t.normalizedName)).toEqual(["newer", "older"]);
  });

  it("上位20件までに絞る", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    for (let i = 0; i < TOP_TAG_COUNT + 5; i++) {
      const t = await insertTag(
        conn.db,
        island.id,
        `t${String(i).padStart(2, "0")}`,
      );
      // t00 が最多、以降は1ずつ少ない（最低でも1件）
      const n = Math.max(1, TOP_TAG_COUNT + 5 - i);
      for (let k = 0; k < n; k++) {
        await tagPost(island.id, user.id, [t.id], daysAgo(1, k));
      }
    }
    const top = await getTopTopicTags(conn.db, island.id, NOW);
    expect(top).toHaveLength(TOP_TAG_COUNT);
    expect(top[0]?.normalizedName).toBe("t00");
    expect(top[TOP_TAG_COUNT - 1]?.normalizedName).toBe("t19");
  });

  it("投稿がない島は空", async () => {
    const island = await insertIsland(conn.db);
    expect(await getTopTopicTags(conn.db, island.id, NOW)).toEqual([]);
  });
});

describe("listMemberTags / getTagByNormalizedName", () => {
  it("メンバータグだけを返し、保存した位置を含む", async () => {
    const island = await insertIsland(conn.db);
    const m = await insertTag(conn.db, island.id, "みさき", "member");
    await insertTag(conn.db, island.id, "topic1");
    const { tags } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await conn.db
      .update(tags)
      .set({ position: { x: 10, y: -5 } })
      .where(eq(tags.id, m.id));
    const members = await listMemberTags(conn.db, island.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      name: "みさき",
      position: { x: 10, y: -5 },
    });
    expect(
      await getTagByNormalizedName(conn.db, island.id, "topic1"),
    ).toBeDefined();
    expect(
      await getTagByNormalizedName(conn.db, island.id, "none"),
    ).toBeUndefined();
  });
});

describe("searchTags", () => {
  it("前方一致を先に、部分一致を後に並べる。% や _ はただの文字として扱う", async () => {
    const island = await insertIsland(conn.db);
    const other = await insertIsland(conn.db);
    await insertTag(conn.db, island.id, "ライブ");
    await insertTag(conn.db, island.id, "ツアーライブ");
    await insertTag(conn.db, island.id, "ライブ配信");
    await insertTag(conn.db, island.id, "雑談");
    await insertTag(conn.db, island.id, "100%");
    await insertTag(conn.db, island.id, "a_b");
    await insertTag(conn.db, island.id, "axb");
    await insertTag(conn.db, other.id, "ライブ他島");

    const live = await searchTags(conn.db, island.id, "ライブ", 10);
    expect(live.map((t) => t.normalizedName)).toEqual([
      "ライブ",
      "ライブ配信",
      "ツアーライブ",
    ]);
    expect(
      (await searchTags(conn.db, island.id, "%", 10)).map(
        (t) => t.normalizedName,
      ),
    ).toEqual(["100%"]);
    expect(
      (await searchTags(conn.db, island.id, "a_b", 10)).map(
        (t) => t.normalizedName,
      ),
    ).toEqual(["a_b"]);
    expect(await searchTags(conn.db, island.id, "存在しない", 10)).toEqual([]);
  });

  it("limit で件数を絞り、空のクエリでも候補を返す", async () => {
    const island = await insertIsland(conn.db);
    for (let i = 0; i < 5; i++) await insertTag(conn.db, island.id, `tag${i}`);
    expect(await searchTags(conn.db, island.id, "tag", 3)).toHaveLength(3);
    expect(await searchTags(conn.db, island.id, "", 4)).toHaveLength(4);
    const first = must((await searchTags(conn.db, island.id, "", 1))[0]);
    expect(first.kind).toBe("topic");
  });
});
