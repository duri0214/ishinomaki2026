import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { islands } from "@/db/schema";
import {
  ISLAND_GRID_ROWS,
  islandGridPosition,
  nextIslandPosition,
} from "@/features/islands/placement";
import { ISLAND_RADIUS } from "@/features/map/layout";
import { arrangeIslands } from "../../scripts/arrange-islands-apply";
import { applySeed } from "../../scripts/seed-apply";
import { generateSeed } from "../../scripts/seed-data";
import { createTestDb } from "../helpers/db";

describe("島の2段の並び", () => {
  it("上→下→次の列の順に並び、島どうしは重ならない", () => {
    const ps = Array.from({ length: 7 }, (_, i) => islandGridPosition(i));
    expect(new Set(ps.map((p) => p.y > 300)).size).toBe(ISLAND_GRID_ROWS);
    expect(ps[1]?.x).toBe(ps[0]?.x);
    expect(ps[2]?.x).toBeGreaterThan(ps[1]?.x ?? 0);
    for (const [i, a] of ps.entries()) {
      for (const b of ps.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
          ISLAND_RADIUS * 2,
        );
      }
    }
  });

  it("新しい島は、今ある島と重ならない最初の場所に置く（横一列の古い並びでも）", () => {
    const row = [0, 810, 1620].map((x) => ({ worldX: x, worldY: 0 }));
    const p = nextIslandPosition(row);
    expect(p).toEqual(islandGridPosition(1));
    expect(nextIslandPosition([])).toEqual({ x: 0, y: 0 });
  });
});

describe("今ある島を2段に並べ直す", () => {
  let conn: Connection;
  beforeAll(async () => {
    conn = await createTestDb();
    await applySeed(conn.txDb, generateSeed(new Date("2026-10-11T12:00:00Z")));
    // 横一列に並んでしまった状態にする
    const rows = await conn.db.select().from(islands);
    for (const [i, r] of rows.entries()) {
      await conn.db
        .update(islands)
        .set({ worldX: i * 810, worldY: 0 })
        .where(eq(islands.id, r.id));
    }
  });
  afterAll(async () => {
    await conn.close();
  });

  it("作った順（同時なら左から）に2段の並びの位置へ置き直す", async () => {
    const result = await arrangeIslands(conn.txDb);
    expect(result).toHaveLength(4);
    result.forEach((r, i) => {
      expect({ x: r.x, y: r.y }).toEqual(islandGridPosition(i));
    });
    const saved = await conn.db.select().from(islands);
    for (const r of result) {
      const s = saved.find((i) => i.slug === r.slug);
      expect({ x: s?.worldX, y: s?.worldY }).toEqual({ x: r.x, y: r.y });
    }
  });
});
