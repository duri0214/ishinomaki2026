import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { userFavoriteIslands, users } from "@/db/schema";
import { islandLevel } from "@/features/map/layout";
import { applySeed } from "../../scripts/seed-apply";
import { generateSeed } from "../../scripts/seed-data";
import { applyFollowers } from "../../scripts/seed-followers-apply";
import { createTestDb } from "../helpers/db";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
  await applySeed(conn.txDb, generateSeed(new Date("2026-10-11T12:00:00Z")));
});

afterAll(async () => {
  await conn.close();
});

describe("島民数のテストデータ", () => {
  it("島ごとに目標の人数が推しになり、レベルが違って見える。何度実行しても同じ", async () => {
    const targets = { hoshizora: 120, shiokaze: 15, tsukiakari: 3, nope: 50 };
    const levels = async () => {
      const rows = await conn.db
        .select({ islandId: userFavoriteIslands.islandId, n: count() })
        .from(userFavoriteIslands)
        .groupBy(userFavoriteIslands.islandId);
      const followers = new Map(rows.map((r) => [r.islandId, r.n]));
      const seed = generateSeed(new Date("2026-10-11T12:00:00Z"));
      return Object.fromEntries(
        seed.islands.map((i) => [i.slug, followers.get(i.id as string) ?? 0]),
      );
    };
    const result = await applyFollowers(conn.txDb, targets);
    expect(result.map((r) => r.slug)).toEqual([
      "hoshizora",
      "shiokaze",
      "tsukiakari",
    ]);
    const first = await levels();
    expect(first).toMatchObject({
      hoshizora: 120,
      shiokaze: 15,
      tsukiakari: 3,
    });
    expect(islandLevel(first.hoshizora ?? 0)).toBe(3);
    expect(islandLevel(first.shiokaze ?? 0)).toBe(2);

    await applyFollowers(conn.txDb, targets);
    expect(await levels()).toEqual(first);
    // ダミーユーザーは最大人数ぶんだけ
    expect(await conn.db.$count(users)).toBe(10 + 120);
  });

  it("島の名前でも指定でき、0人の島は Lv1 のまま", async () => {
    const result = await applyFollowers(conn.txDb, {
      TWICE: 12,
      hoshizora: 0,
      nope: 50,
    });
    expect(result).toEqual([
      { slug: "shiokaze", name: "TWICE", followers: 12 },
      { slug: "hoshizora", name: "ARASHI", followers: 0 },
    ]);
    expect(islandLevel(0)).toBe(1);
    // ダミーユーザーは最大人数ぶんだけ（前回の分は消える）
    expect(await conn.db.$count(users)).toBe(10 + 12);
  });
});
