import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { islands, postTags, tags, userFavoriteMembers } from "@/db/schema";
import {
  createIsland,
  createTopicTag,
  saveIsland,
  setIslandBase,
} from "@/features/islands/admin";
import { getFavorites, updateProfile } from "@/features/profile/service";
import { validateTagName } from "@/features/tags/parse";
import { listMemberTags } from "@/features/tags/queries";
import { assertDevEditor, isDevEditorEnabled } from "@/lib/dev-only";
import { createTestDb } from "../helpers/db";
import { insertPost, insertTag, insertUser } from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

const save = (
  over: Partial<Parameters<typeof saveIsland>[1]> & { slug: string },
) =>
  saveIsland(conn.txDb, {
    name: "島",
    description: "",
    worldX: 0,
    worldY: 0,
    members: [],
    ...over,
  });

describe("createIsland", () => {
  it("島を作り、2つ目以降は既存の島と重ならない位置に置く", async () => {
    const a = await createIsland(conn.db, { slug: "first", name: "最初の島" });
    const b = await createIsland(conn.db, {
      slug: "second",
      name: "二つ目",
      description: "説明",
    });
    expect(a.worldX).toBe(0);
    expect(b.worldX - a.worldX).toBeGreaterThanOrEqual(690);
    expect(b.description).toBe("説明");
  });

  it("slug の重複・不正な slug・空の名前はエラー", async () => {
    await expect(
      createIsland(conn.db, { slug: "first", name: "重複" }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("slug"),
    });
    await expect(
      createIsland(conn.db, { slug: "Bad_Slug", name: "x" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      createIsland(conn.db, { slug: "ok-slug", name: "  " }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("saveIsland", () => {
  it("名前・説明・世界地図上の座標を保存する", async () => {
    await createIsland(conn.db, { slug: "edit-me", name: "before" });
    await save({
      slug: "edit-me",
      name: "after",
      description: " 説明 ",
      worldX: 123.4,
      worldY: -56,
    });
    const [row] = await conn.db
      .select()
      .from(islands)
      .where(eq(islands.slug, "edit-me"));
    expect(must(row)).toMatchObject({
      name: "after",
      description: "説明",
      worldX: 123.4,
      worldY: -56,
    });
  });

  it("メンバータグを作り、位置を保存する（広場の外は縁に収める）", async () => {
    const island = await createIsland(conn.db, { slug: "members", name: "m" });
    await save({
      slug: "members",
      members: [
        { name: "みさき", x: 10, y: -20 },
        { name: "Hina", x: 4000, y: 0 },
      ],
    });
    const members = await listMemberTags(conn.db, island.id);
    // 同じトランザクションで作ったので作成時刻は同じ。名前順（normalized_name）で安定して並ぶ
    expect(members.map((m) => [m.name, m.normalizedName])).toEqual([
      ["Hina", "hina"],
      ["みさき", "みさき"],
    ]);
    expect(members[1]?.position).toEqual({ x: 10, y: -20 });
    const hina = must(members[0]?.position);
    expect(Math.hypot(hina.x, hina.y)).toBeLessThanOrEqual(85);
  });

  it("既存の話題タグをメンバーに昇格でき、一覧から外すと話題タグに戻る（投稿は残る）", async () => {
    const island = await createIsland(conn.db, { slug: "promote", name: "p" });
    const user = await insertUser(conn.db);
    const topic = await insertTag(conn.db, island.id, "りお");
    const post = await insertPost(conn.db, {
      islandId: island.id,
      authorId: user.id,
    });
    await conn.db.insert(postTags).values({ postId: post.id, tagId: topic.id });

    await save({ slug: "promote", members: [{ name: "りお", x: 0, y: 0 }] });
    let row = must(
      (await conn.db.select().from(tags).where(eq(tags.id, topic.id)))[0],
    );
    expect(row.kind).toBe("member");

    await save({ slug: "promote", members: [] });
    row = must(
      (await conn.db.select().from(tags).where(eq(tags.id, topic.id)))[0],
    );
    expect(row.kind).toBe("topic");
    expect(row.position).toBeNull();
    const links = await conn.db
      .select()
      .from(postTags)
      .where(eq(postTags.tagId, topic.id));
    expect(links).toHaveLength(1);
  });

  it("メンバーから外したタグは、推しメンバーからも外れる（推しグループは残る）", async () => {
    await createIsland(conn.db, { slug: "oshi", name: "推し島" });
    await save({
      slug: "oshi",
      members: [
        { name: "あおい", x: 0, y: 0 },
        { name: "ゆず", x: 10, y: 0 },
      ],
    });
    const user = await insertUser(conn.db);
    const island = must(
      (await conn.db.select().from(islands).where(eq(islands.slug, "oshi")))[0],
    );
    const members = await listMemberTags(conn.db, island.id);
    await updateProfile(conn.txDb, user.id, {
      displayName: "x",
      favorites: [
        { islandSlug: "oshi", memberTagIds: members.map((m) => m.id) },
      ],
    });

    await save({ slug: "oshi", members: [{ name: "ゆず", x: 10, y: 0 }] });
    const favorites = await getFavorites(conn.db, user.id);
    expect(favorites.map((f) => f.island.slug)).toEqual(["oshi"]);
    expect(favorites[0]?.members.map((m) => m.name)).toEqual(["ゆず"]);
    const rows = await conn.db
      .select()
      .from(userFavoriteMembers)
      .where(eq(userFavoriteMembers.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("保存を繰り返しても同じ結果になり、メンバーが増殖しない", async () => {
    const island = await createIsland(conn.db, { slug: "idem", name: "i" });
    const members = [
      { name: "あ", x: 0, y: 0 },
      { name: "い", x: 20, y: 20 },
    ];
    await save({ slug: "idem", members });
    await save({ slug: "idem", members });
    await save({
      slug: "idem",
      members: [members[0] as (typeof members)[number]],
    });
    expect(await listMemberTags(conn.db, island.id)).toHaveLength(1);
  });

  it("不正なメンバー名・重複・多すぎる人数・存在しない島はエラーで、何も変更しない", async () => {
    const island = await createIsland(conn.db, {
      slug: "invalid",
      name: "keep",
    });
    await expect(
      save({
        slug: "invalid",
        name: "changed",
        members: [{ name: "a b", x: 0, y: 0 }],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save({
        slug: "invalid",
        members: [
          { name: "Ａ", x: 0, y: 0 },
          { name: "a", x: 1, y: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save({
        slug: "invalid",
        members: Array.from({ length: 21 }, (_, i) => ({
          name: `m${i}`,
          x: 0,
          y: 0,
        })),
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(save({ slug: "no-such-island" })).rejects.toMatchObject({
      code: "island_not_found",
    });
    const [row] = await conn.db
      .select()
      .from(islands)
      .where(eq(islands.id, island.id));
    expect(must(row).name).toBe("keep");
  });

  it("座標が数値でない・範囲外ならエラー", async () => {
    await createIsland(conn.db, { slug: "coords", name: "c" });
    await expect(
      save({ slug: "coords", worldX: Number.NaN }),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(save({ slug: "coords", worldY: 1e9 })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("validateTagName", () => {
  it("全体がひとつの有効なタグ名のときだけ返す", () => {
    expect(validateTagName("みさき")).toEqual({
      name: "みさき",
      normalizedName: "みさき",
    });
    expect(validateTagName("ＭＩＳＡ")).toEqual({
      name: "MISA",
      normalizedName: "misa",
    });
    expect(validateTagName("a b")).toBeNull();
    expect(validateTagName("#a")).toBeNull();
    expect(validateTagName("123")).toBeNull();
    expect(validateTagName("あ".repeat(31))).toBeNull();
    expect(validateTagName("")).toBeNull();
  });
});

describe("開発環境ガード", () => {
  it("本番では無効、それ以外では有効", () => {
    expect(isDevEditorEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isDevEditorEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isDevEditorEnabled({ NODE_ENV: "test" })).toBe(true);
  });
  it("本番では assertDevEditor が forbidden を投げる", () => {
    const original = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(() => assertDevEditor()).toThrowError(
        expect.objectContaining({ code: "forbidden" }),
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = original;
    }
  });
});

describe("setIslandBase / createTopicTag", () => {
  it("島を作るときに土台を選べる（theme.base）。ない土台はエラー", async () => {
    const island = await createIsland(conn.db, {
      slug: "with-base",
      name: "土台つきの島",
      base: "base-07",
    });
    expect(island.theme).toMatchObject({ base: "base-07" });
    await expect(
      createIsland(conn.db, { slug: "bad-base", name: "島", base: "base-99" }),
    ).rejects.toThrow("その土台はありません");
  });

  it("土台を選ぶと theme.base に保存し、ない土台はエラー", async () => {
    await createIsland(conn.db, { slug: "base-test", name: "土台の島" });
    const island = await setIslandBase(conn.db, "base-test", "base-05");
    expect(island.theme).toMatchObject({ base: "base-05" });
    await expect(
      setIslandBase(conn.db, "base-test", "base-99"),
    ).rejects.toThrow("その土台はありません");
    await expect(setIslandBase(conn.db, "nope", "base-01")).rejects.toThrow(
      "島が見つかりません",
    );
  });

  it("家（話題タグ）を建てる。# は付けても付けなくてもよく、同じ名前は2回建てられない", async () => {
    await createIsland(conn.db, { slug: "house-test", name: "家の島" });
    expect(await createTopicTag(conn.db, "house-test", "#新しい家")).toEqual({
      normalizedName: "新しい家",
    });
    await expect(
      createTopicTag(conn.db, "house-test", "新しい家"),
    ).rejects.toThrow("すでにあります");
    await expect(
      createTopicTag(conn.db, "house-test", "空白 あり"),
    ).rejects.toThrow("タグ名として使えません");
    const [row] = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.normalizedName, "新しい家"));
    expect(row?.kind).toBe("topic");
  });
});
