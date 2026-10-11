import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { rowsOf } from "@/db/rows";
import { islands, posts, tags, users } from "@/db/schema";
import { createTestDb } from "../helpers/db";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("スキーマ", () => {
  it("全テーブルが作成される", async () => {
    const res = await conn.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = rowsOf<{ table_name: string }>(res).map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "islands",
        "likes",
        "post_tags",
        "posts",
        "tags",
        "users",
      ]),
    );
  });

  it("必要なインデックスが作成される", async () => {
    const res = await conn.db.execute(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = rowsOf<{ indexname: string }>(res).map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "posts_island_created_idx",
        "posts_created_idx",
        "post_tags_tag_post_idx",
        "likes_post_idx",
      ]),
    );
  });

  it("タグ名は島内で一意（別の島なら同じ名前を使える）", async () => {
    const [a] = await conn.db
      .insert(islands)
      .values({ slug: "a", name: "A", worldX: 0, worldY: 0 })
      .returning();
    const [b] = await conn.db
      .insert(islands)
      .values({ slug: "b", name: "B", worldX: 1, worldY: 1 })
      .returning();
    const values = (islandId: string) => ({
      islandId,
      name: "自己紹介",
      normalizedName: "自己紹介",
    });
    const aId = must(a).id;
    const bId = must(b).id;
    await conn.db.insert(tags).values(values(aId));
    await conn.db.insert(tags).values(values(bId));
    await expect(conn.db.insert(tags).values(values(aId))).rejects.toThrow();
  });

  it("時刻はミリ秒精度で保存され、Dateを往復しても同じ値になる", async () => {
    const [u] = await conn.db
      .insert(users)
      .values({ clerkUserId: "u1", displayName: "u1" })
      .returning();
    const [isl] = await conn.db.select().from(islands).limit(1);
    const [p] = await conn.db
      .insert(posts)
      .values({
        islandId: must(isl).id,
        authorId: must(u).id,
        body: "x",
      })
      .returning();
    const post = must(p);
    const again = await conn.db.execute(
      sql`select (created_at = ${post.createdAt.toISOString()}::timestamptz) as same from posts where id = ${post.id}`,
    );
    expect(must(rowsOf<{ same: boolean }>(again)[0]).same).toBe(true);
  });

  it("transaction() が使え、失敗するとロールバックされる", async () => {
    await expect(
      conn.txDb.transaction(async (tx) => {
        await tx
          .insert(islands)
          .values({ slug: "rollback", name: "R", worldX: 0, worldY: 0 });
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    const rows = await conn.db.select().from(islands);
    expect(rows.find((r) => r.slug === "rollback")).toBeUndefined();
  });
});
