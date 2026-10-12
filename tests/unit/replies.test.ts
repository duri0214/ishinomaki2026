import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { posts, tags } from "@/db/schema";
import { createPost, createReply, deletePost } from "@/features/posts/service";
import { getTopTopicTags } from "@/features/tags/queries";
import {
  getReplies,
  getTimeline,
  getTimelinePost,
} from "@/features/timeline/queries";
import { createTestDb } from "../helpers/db";
import { insertIsland, insertPost, insertUser } from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

async function setup() {
  const island = await insertIsland(conn.db);
  const author = await insertUser(conn.db);
  const replier = await insertUser(conn.db);
  const parent = await insertPost(conn.db, {
    islandId: island.id,
    authorId: author.id,
  });
  return { island, author, replier, parent };
}

describe("createReply", () => {
  it("返信先と同じ島に、parentPostId 付きで作る", async () => {
    const { island, replier, parent } = await setup();
    const { postId } = await createReply(conn.db, {
      userId: replier.id,
      parentPostId: parent.id,
      body: "  返信です  ",
    });
    const [row] = await conn.db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));
    expect(must(row)).toMatchObject({
      islandId: island.id,
      authorId: replier.id,
      parentPostId: parent.id,
      body: "返信です",
    });
  });

  it("返信への返信は、元の投稿に付ける（階層は1段）", async () => {
    const { replier, author, parent } = await setup();
    const first = await createReply(conn.db, {
      userId: replier.id,
      parentPostId: parent.id,
      body: "1つ目",
    });
    const second = await createReply(conn.db, {
      userId: author.id,
      parentPostId: first.postId,
      body: "返信への返信",
    });
    const [row] = await conn.db
      .select({ parentPostId: posts.parentPostId })
      .from(posts)
      .where(eq(posts.id, second.postId));
    expect(row?.parentPostId).toBe(parent.id);
    const replies = await getReplies(conn.db, parent.id, null);
    expect(replies.map((r) => r.body)).toEqual(["1つ目", "返信への返信"]);
  });

  it("本文のハッシュタグを通常の投稿と同じように登録する", async () => {
    const { island, replier, parent } = await setup();
    await createReply(conn.db, {
      userId: replier.id,
      parentPostId: parent.id,
      body: "#返信タグ",
    });
    const rows = await conn.db
      .select({ n: tags.normalizedName })
      .from(tags)
      .where(eq(tags.islandId, island.id));
    expect(rows.map((r) => r.n)).toEqual(["返信タグ"]);
  });

  it("空の本文・長すぎる本文・不正なIDは validation", async () => {
    const { replier, parent } = await setup();
    for (const input of [
      { parentPostId: parent.id, body: "   " },
      { parentPostId: parent.id, body: "あ".repeat(281) },
      { parentPostId: "not-a-uuid", body: "返信" },
    ]) {
      await expect(
        createReply(conn.db, { userId: replier.id, ...input }),
      ).rejects.toMatchObject({ code: "validation" });
    }
  });

  it("存在しない投稿・削除済みの投稿には返信できない", async () => {
    const { island, author, replier, parent } = await setup();
    await expect(
      createReply(conn.db, {
        userId: replier.id,
        parentPostId: crypto.randomUUID(),
        body: "返信",
      }),
    ).rejects.toMatchObject({ code: "post_not_found" });

    await deletePost(conn.db, { userId: author.id, postId: parent.id });
    await expect(
      createReply(conn.db, {
        userId: replier.id,
        parentPostId: parent.id,
        body: "返信",
      }),
    ).rejects.toMatchObject({ code: "post_not_found" });

    // 元の投稿が削除されていれば、その返信への返信もできない
    const live = await insertPost(conn.db, {
      islandId: island.id,
      authorId: author.id,
    });
    const reply = await insertPost(conn.db, {
      islandId: island.id,
      authorId: replier.id,
      parentPostId: live.id,
    });
    await deletePost(conn.db, { userId: author.id, postId: live.id });
    await expect(
      createReply(conn.db, {
        userId: author.id,
        parentPostId: reply.id,
        body: "返信への返信",
      }),
    ).rejects.toMatchObject({ code: "post_not_found" });
  });
});

describe("返信の表示", () => {
  it("返信は全島・島・タグのどのタイムラインにも出ない", async () => {
    const { island, replier } = await setup();
    const { postId: tagged } = await createPost(conn.db, {
      userId: replier.id,
      islandSlug: island.slug,
      body: "#ひみつ",
    });
    const { postId: reply } = await createReply(conn.db, {
      userId: replier.id,
      parentPostId: tagged,
      body: "返信 #ひみつ",
    });
    const [tag] = await conn.db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.islandId, island.id));

    for (const scope of [
      { kind: "all" as const },
      { kind: "island" as const, islandId: island.id },
      { kind: "tag" as const, islandId: island.id, tagId: must(tag).id },
    ]) {
      const page = await getTimeline(conn.db, {
        scope,
        limit: 50,
        viewerId: null,
      });
      const ids = page.posts.map((p) => p.id);
      expect(ids).toContain(tagged);
      expect(ids).not.toContain(reply);
    }
  });

  it("返信は話題タグの順位に数えない", async () => {
    const { island, replier, parent } = await setup();
    await createReply(conn.db, {
      userId: replier.id,
      parentPostId: parent.id,
      body: "#返信だけのタグ",
    });
    const ranked = await getTopTopicTags(conn.db, island.id);
    expect(ranked.map((t) => t.normalizedName)).not.toContain("返信だけのタグ");
  });

  it("replyCount は投稿ごとに数え、削除済みの返信は含めない", async () => {
    const { island, author, replier, parent } = await setup();
    const other = await insertPost(conn.db, {
      islandId: island.id,
      authorId: author.id,
    });
    for (const body of ["a", "b", "c"]) {
      await insertPost(conn.db, {
        islandId: island.id,
        authorId: replier.id,
        parentPostId: parent.id,
        body,
      });
    }
    const gone = await insertPost(conn.db, {
      islandId: island.id,
      authorId: replier.id,
      parentPostId: parent.id,
      deletedAt: new Date(),
    });
    await insertPost(conn.db, {
      islandId: island.id,
      authorId: replier.id,
      parentPostId: other.id,
    });

    expect(
      must(await getTimelinePost(conn.db, parent.id, null)).replyCount,
    ).toBe(3);
    expect(
      must(await getTimelinePost(conn.db, other.id, null)).replyCount,
    ).toBe(1);
    const page = await getTimeline(conn.db, {
      scope: { kind: "island", islandId: island.id },
      limit: 10,
      viewerId: null,
    });
    expect(page.posts.find((p) => p.id === parent.id)?.replyCount).toBe(3);
    expect(page.posts.find((p) => p.id === other.id)?.replyCount).toBe(1);

    const replies = await getReplies(conn.db, parent.id, null);
    expect(replies).toHaveLength(3);
    expect(replies.map((r) => r.id)).not.toContain(gone.id);
  });

  it("getReplies は古い順で isMine を返す。元の投稿が削除済みなら空", async () => {
    const { island, author, replier, parent } = await setup();
    const t0 = Date.now();
    await insertPost(conn.db, {
      islandId: island.id,
      authorId: replier.id,
      parentPostId: parent.id,
      body: "新しい",
      createdAt: new Date(t0),
    });
    await insertPost(conn.db, {
      islandId: island.id,
      authorId: author.id,
      parentPostId: parent.id,
      body: "古い",
      createdAt: new Date(t0 - 60_000),
    });
    const replies = await getReplies(conn.db, parent.id, replier.id);
    expect(replies.map((r) => [r.body, r.isMine])).toEqual([
      ["古い", false],
      ["新しい", true],
    ]);

    await deletePost(conn.db, { userId: author.id, postId: parent.id });
    expect(await getReplies(conn.db, parent.id, null)).toEqual([]);
  });

  it("自分の返信は削除でき、他人の返信は削除できない", async () => {
    const { author, replier, parent } = await setup();
    const { postId } = await createReply(conn.db, {
      userId: replier.id,
      parentPostId: parent.id,
      body: "消す",
    });
    await expect(
      deletePost(conn.db, { userId: author.id, postId }),
    ).rejects.toMatchObject({ code: "post_not_found" });
    await deletePost(conn.db, { userId: replier.id, postId });
    expect(await getReplies(conn.db, parent.id, null)).toEqual([]);
  });
});
