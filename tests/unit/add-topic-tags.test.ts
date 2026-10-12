import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { islands, tags } from "@/db/schema";
import { applyTopicTags } from "../../scripts/add-topic-tags-apply";
import { applySeed } from "../../scripts/seed-apply";
import { generateSeed } from "../../scripts/seed-data";
import { createTestDb } from "../helpers/db";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
  await applySeed(conn.txDb, generateSeed(new Date("2026-10-11T12:00:00Z")));
});

afterAll(async () => {
  await conn.close();
});

describe("話題タグの追加", () => {
  it("無いタグだけ追加し、2回目は何も追加しない。メンバータグや既存の話題タグは変わらない", async () => {
    const [island] = await conn.db
      .select({ id: islands.id })
      .from(islands)
      .where(eq(islands.slug, "hoshizora"));
    const islandId = island?.id as string;
    const before = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.islandId, islandId));

    const topics = { hoshizora: ["新しい話題A", "ライブ"], nope: ["無い島"] };
    const first = await applyTopicTags(conn.db, topics);
    // 「ライブ」はシードにあるので追加されない。DBに無い島は結果に出ない
    expect(first.map((r) => [r.slug, r.added])).toEqual([
      ["hoshizora", ["新しい話題A"]],
    ]);

    const after = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.islandId, islandId));
    expect(after).toHaveLength(before.length + 1);
    const byId = new Map(after.map((t) => [t.id, t]));
    for (const t of before) expect(byId.get(t.id)).toEqual(t);
    expect(after.find((t) => t.name === "新しい話題A")?.kind).toBe("topic");

    const second = await applyTopicTags(conn.db, topics);
    expect(second[0]?.added).toEqual([]);
  });
});
