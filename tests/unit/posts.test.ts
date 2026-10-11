import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { likes, posts, postTags, tags } from "@/db/schema";
import { setLike } from "@/features/likes/service";
import { createPost, deletePost } from "@/features/posts/service";
import { getTimeline, getTimelinePost } from "@/features/timeline/queries";
import { AppError } from "@/lib/errors";
import { createTestDb } from "../helpers/db";
import { insertIsland, insertTag, insertUser } from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

async function tagNamesOf(postId: string) {
  const rows = await conn.db
    .select({ name: tags.name, kind: tags.kind })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

describe("createPost", () => {
  it("本文の #タグ を登録し、存在しないタグは話題タグとして作る", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "今日は #ライブ ＃Ｔｏｕｒ でした",
    });
    expect(await tagNamesOf(postId)).toEqual([
      { name: "Tour", kind: "topic" },
      { name: "ライブ", kind: "topic" },
    ]);
    const stored = await conn.db
      .select({ n: tags.normalizedName })
      .from(tags)
      .where(eq(tags.islandId, island.id));
    expect(stored.map((s) => s.n).sort()).toEqual(["tour", "ライブ"]);
  });

  it("既存のタグ（メンバータグ含む）は再利用し、種類や表示名を変えない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const member = await insertTag(conn.db, island.id, "みさき", "member");
    const first = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "#みさき #Hello",
    });
    const second = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "#みさき #HELLO",
    });
    const all = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.islandId, island.id));
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id === member.id)?.kind).toBe("member");
    expect(all.find((t) => t.normalizedName === "hello")?.name).toBe("Hello");
    expect(await tagNamesOf(first.postId)).toHaveLength(2);
    expect(await tagNamesOf(second.postId)).toHaveLength(2);
  });

  it("タグは島ごとに独立している", async () => {
    const a = await insertIsland(conn.db);
    const b = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    await createPost(conn.db, {
      userId: user.id,
      islandSlug: a.slug,
      body: "#自己紹介",
    });
    await createPost(conn.db, {
      userId: user.id,
      islandSlug: b.slug,
      body: "#自己紹介",
    });
    const rows = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.normalizedName, "自己紹介"));
    expect(new Set(rows.map((r) => r.islandId))).toEqual(new Set([a.id, b.id]));
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("タグなしの投稿も作れる", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "  こんにちは\r\n世界  ",
    });
    const post = must(await getTimelinePost(conn.db, postId, user.id));
    expect(post.body).toBe("こんにちは\n世界");
    expect(await tagNamesOf(postId)).toEqual([]);
  });

  it("タグ付き投稿は島のタイムラインにすぐ出る", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "#a",
    });
    const page = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: island.id },
      limit: 10,
      viewerId: user.id,
    });
    expect(page.posts.map((p) => p.id)).toEqual([postId]);
  });

  it("本文が空・280文字超・島がない場合はエラーで、何も保存されない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const before = await conn.db.select().from(posts);
    await expect(
      createPost(conn.db, {
        userId: user.id,
        islandSlug: island.slug,
        body: "   ",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      createPost(conn.db, {
        userId: user.id,
        islandSlug: island.slug,
        body: "あ".repeat(281),
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      createPost(conn.db, {
        userId: user.id,
        islandSlug: "no-such-island",
        body: "#x",
      }),
    ).rejects.toMatchObject({ code: "island_not_found" });
    expect(await conn.db.select().from(posts)).toHaveLength(before.length);
  });

  it("280文字ちょうど（コードポイント単位）は投稿できる", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    await expect(
      createPost(conn.db, {
        userId: user.id,
        islandSlug: island.slug,
        body: "𠮷".repeat(280),
      }),
    ).resolves.toBeDefined();
  });

  it("途中で失敗したらロールバックされ、投稿もタグも残らない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const ghost = "00000000-0000-4000-8000-000000000000";
    // 存在しない作者IDだと投稿の挿入で外部キー違反になる
    await expect(
      createPost(conn.db, {
        userId: ghost,
        islandSlug: island.slug,
        body: "#rollback",
      }),
    ).rejects.toThrow();
    const left = await conn.db
      .select()
      .from(tags)
      .where(eq(tags.islandId, island.id));
    expect(left).toEqual([]);
    expect(user.id).toBeDefined();
  });

  it("エラーは AppError", async () => {
    const user = await insertUser(conn.db);
    const err = await createPost(conn.db, {
      userId: user.id,
      islandSlug: "nope",
      body: "x",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("deletePost", () => {
  it("自分の投稿を論理削除でき、タイムラインから消える", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "#del",
    });
    await deletePost(conn.db, { userId: user.id, postId });
    const [row] = await conn.db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));
    expect(must(row).deletedAt).toBeInstanceOf(Date);
    expect(await getTimelinePost(conn.db, postId, user.id)).toBeUndefined();
    const page = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: island.id },
      limit: 10,
      viewerId: null,
    });
    expect(page.posts).toEqual([]);
  });

  it("他人の投稿は削除できない（存在しない・削除済みと同じエラー）", async () => {
    const island = await insertIsland(conn.db);
    const owner = await insertUser(conn.db);
    const attacker = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: owner.id,
      islandSlug: island.slug,
      body: "mine",
    });
    await expect(
      deletePost(conn.db, { userId: attacker.id, postId }),
    ).rejects.toMatchObject({ code: "post_not_found" });
    expect(await getTimelinePost(conn.db, postId, owner.id)).toBeDefined();
    await deletePost(conn.db, { userId: owner.id, postId });
    await expect(
      deletePost(conn.db, { userId: owner.id, postId }),
    ).rejects.toMatchObject({ code: "post_not_found" });
  });
});

describe("setLike", () => {
  it("望む状態を送る方式で、連打や再送でも件数が正しい", async () => {
    const island = await insertIsland(conn.db);
    const author = await insertUser(conn.db);
    const fan1 = await insertUser(conn.db);
    const fan2 = await insertUser(conn.db);
    const { postId } = await createPost(conn.db, {
      userId: author.id,
      islandSlug: island.slug,
      body: "like me",
    });

    // 同じ状態を並行して何度送っても1件
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        setLike(conn.db, { userId: fan1.id, postId, liked: true }),
      ),
    );
    expect(results.every((r) => r.liked)).toBe(true);
    expect(
      (await setLike(conn.db, { userId: fan2.id, postId, liked: true }))
        .likeCount,
    ).toBe(2);
    expect(
      (await setLike(conn.db, { userId: fan1.id, postId, liked: false }))
        .likeCount,
    ).toBe(1);
    // 既に外れていても外れた状態を送り直せる
    expect(
      (await setLike(conn.db, { userId: fan1.id, postId, liked: false }))
        .likeCount,
    ).toBe(1);
    const rows = await conn.db
      .select()
      .from(likes)
      .where(and(eq(likes.postId, postId)));
    expect(rows).toHaveLength(1);
  });

  it("存在しない投稿・削除済みの投稿にはいいねできない", async () => {
    const island = await insertIsland(conn.db);
    const user = await insertUser(conn.db);
    await expect(
      setLike(conn.db, {
        userId: user.id,
        postId: "00000000-0000-4000-8000-000000000000",
        liked: true,
      }),
    ).rejects.toMatchObject({ code: "post_not_found" });
    const { postId } = await createPost(conn.db, {
      userId: user.id,
      islandSlug: island.slug,
      body: "x",
    });
    await deletePost(conn.db, { userId: user.id, postId });
    await expect(
      setLike(conn.db, { userId: user.id, postId, liked: true }),
    ).rejects.toMatchObject({ code: "post_not_found" });
  });
});
