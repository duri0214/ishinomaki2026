import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { islands, likes, posts, tags, users } from "@/db/schema";
import { getTopTopicTags, listMemberTags } from "@/features/tags/queries";
import { applySeed } from "../../scripts/seed-apply";
import { generateSeed } from "../../scripts/seed-data";
import { createTestDb } from "../helpers/db";

const NOW = new Date("2026-10-11T12:00:00.000Z");
let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("シードデータ", () => {
  it("同じ時刻なら毎回同じデータになる", () => {
    expect(generateSeed(NOW)).toEqual(generateSeed(NOW));
  });

  it("島2つ・メンバー各5人・話題タグ50件以上・ユーザー10人・投稿500件程度", () => {
    const seed = generateSeed(NOW);
    expect(seed.islands).toHaveLength(2);
    expect(seed.users).toHaveLength(10);
    expect(seed.posts.length).toBeGreaterThanOrEqual(500);
    expect(
      seed.tags.filter((t) => t.kind === "topic").length,
    ).toBeGreaterThanOrEqual(50);
    for (const island of seed.islands) {
      expect(
        seed.tags.filter(
          (t) => t.islandId === island.id && t.kind === "member",
        ),
      ).toHaveLength(5);
    }
  });

  it("タグ付きの投稿もタグなしの投稿もある", () => {
    const seed = generateSeed(NOW);
    const tagged = new Set(seed.postTags.map((p) => p.postId));
    expect(tagged.size).toBeGreaterThan(0);
    expect(tagged.size).toBeLessThan(seed.posts.length);
  });
});

describe("applySeed", () => {
  it("何度実行しても同じ状態になり、島ごとに上位20件の差がつく", async () => {
    const counts = async () => ({
      islands: await conn.db.$count(islands),
      tags: await conn.db.$count(tags),
      posts: await conn.db.$count(posts),
      users: await conn.db.$count(users),
      likes: await conn.db.$count(likes),
    });
    await applySeed(conn.txDb, generateSeed(NOW));
    const first = await counts();
    await applySeed(conn.txDb, generateSeed(NOW));
    await applySeed(conn.txDb, generateSeed(NOW));
    expect(await counts()).toEqual(first);
    expect(first.islands).toBe(2);

    const all = await conn.db.select().from(islands);
    const tops = [];
    for (const island of all) {
      const top = await getTopTopicTags(conn.db, island.id, NOW);
      expect(top).toHaveLength(20);
      // 投稿数に差がつくこと（先頭が最後より多い）
      expect((top[0]?.postCount ?? 0) > (top[19]?.postCount ?? 0)).toBe(true);
      expect(await listMemberTags(conn.db, island.id)).toHaveLength(5);
      tops.push(top.map((t) => t.normalizedName));
    }
    // 島ごとに別のタグレコードなので、同じ名前でもIDは別
    const ids = (await conn.db.select({ id: tags.id }).from(tags)).map(
      (t) => t.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
