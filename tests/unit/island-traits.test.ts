import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { islandTraits } from "@/db/schema";
import { createIsland } from "@/features/islands/admin";
import { TRAIT_AXES, TRAIT_KEYS } from "@/features/traits/constants";
import { getIslandTraits, saveIslandTraits } from "@/features/traits/service";
import { createTestDb } from "../helpers/db";
import { insertIsland } from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("傾向タグの定義", () => {
  it("10軸で、キーが重複しない", () => {
    expect(TRAIT_AXES).toHaveLength(10);
    expect(new Set(TRAIT_KEYS).size).toBe(10);
  });
});

describe("saveIslandTraits / getIslandTraits", () => {
  it("島ごとに軸の値を保存・更新・取得できる", async () => {
    const island = await createIsland(conn.db, { slug: "tr-a", name: "A" });
    const other = await createIsland(conn.db, { slug: "tr-b", name: "B" });

    expect(await getIslandTraits(conn.db, island.id)).toEqual({});

    await saveIslandTraits(conn.txDb, {
      slug: "tr-a",
      scores: { "cute-cool": 1, "japanese-western": 5 },
    });
    await saveIslandTraits(conn.txDb, {
      slug: "tr-b",
      scores: { "cute-cool": 3 },
    });
    expect(await getIslandTraits(conn.db, island.id)).toEqual({
      "cute-cool": 1,
      "japanese-western": 5,
    });

    // 更新: 渡した軸だけが変わり、渡さなかった軸はそのまま
    const saved = await saveIslandTraits(conn.txDb, {
      slug: "tr-a",
      scores: { "cute-cool": 4 },
    });
    expect(saved).toEqual({ "cute-cool": 4, "japanese-western": 5 });
    expect(await getIslandTraits(conn.db, other.id)).toEqual({
      "cute-cool": 3,
    });
  });

  it("10軸すべてを保存できる", async () => {
    const island = await createIsland(conn.db, { slug: "tr-all", name: "all" });
    const scores = Object.fromEntries(
      TRAIT_KEYS.map((k, i) => [k, (i % 5) + 1]),
    );
    const saved = await saveIslandTraits(conn.txDb, { slug: "tr-all", scores });
    expect(saved).toEqual(scores);
    expect(await getIslandTraits(conn.db, island.id)).toEqual(scores);
  });

  it("null を渡すとその軸は未評価に戻る（行が消える）", async () => {
    const island = await createIsland(conn.db, { slug: "tr-null", name: "n" });
    await saveIslandTraits(conn.txDb, {
      slug: "tr-null",
      scores: { "cute-cool": 2, "chill-explosive": 5 },
    });
    await saveIslandTraits(conn.txDb, {
      slug: "tr-null",
      scores: { "cute-cool": null },
    });
    expect(await getIslandTraits(conn.db, island.id)).toEqual({
      "chill-explosive": 5,
    });
    const rows = await conn.db
      .select()
      .from(islandTraits)
      .where(eq(islandTraits.islandId, island.id));
    expect(rows).toHaveLength(1);
  });

  it("1〜5以外・小数・未知の軸・存在しない島はエラーで、何も変更しない", async () => {
    const island = await createIsland(conn.db, { slug: "tr-bad", name: "b" });
    await saveIslandTraits(conn.txDb, {
      slug: "tr-bad",
      scores: { "cute-cool": 2 },
    });
    for (const bad of [0, 6, -1, 2.5, Number.NaN]) {
      await expect(
        saveIslandTraits(conn.txDb, {
          slug: "tr-bad",
          scores: { "fresh-sexy": 3, "cute-cool": bad },
        }),
      ).rejects.toMatchObject({ code: "validation" });
    }
    await expect(
      saveIslandTraits(conn.txDb, {
        slug: "tr-bad",
        scores: { "no-such-axis": 3 } as never,
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      saveIslandTraits(conn.txDb, {
        slug: "no-such-island",
        scores: { "cute-cool": 3 },
      }),
    ).rejects.toMatchObject({ code: "island_not_found" });
    expect(await getIslandTraits(conn.db, island.id)).toEqual({
      "cute-cool": 2,
    });
  });

  it("DB の制約でも 1〜5 以外は拒否される", async () => {
    const island = await insertIsland(conn.db);
    for (const score of [0, 6]) {
      await expect(
        conn.db.insert(islandTraits).values({
          islandId: island.id,
          axis: "cute-cool",
          score,
        }),
      ).rejects.toThrow();
    }
    await conn.db
      .insert(islandTraits)
      .values({ islandId: island.id, axis: "cute-cool", score: 3 });
    const [row] = await conn.db
      .select()
      .from(islandTraits)
      .where(eq(islandTraits.islandId, island.id));
    expect(must(row).score).toBe(3);
  });
});
