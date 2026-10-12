import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import {
  dmConversations,
  dmMessages,
  posts,
  postTags,
  users,
} from "@/db/schema";
import {
  getConversation,
  getMessageNotifications,
  getMessages,
  listConversations,
  markConversationRead,
  sendMessage,
  startConversation,
} from "@/features/messages/service";
import { createTestDb } from "../helpers/db";
import { insertUser } from "../helpers/fixtures";

let conn: Connection;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(async () => {
  await conn.close();
});

async function pair() {
  const a = await insertUser(conn.db);
  const b = await insertUser(conn.db);
  const conversation = await startConversation(conn.db, a.id, b.id);
  return { a, b, id: conversation.id };
}

describe("DM", () => {
  it("通知は自分宛の未読数だけを数え、本文や相手の既読状態を含めない", async () => {
    const { a, b, id } = await pair();
    const stranger = await insertUser(conn.db);
    expect(await getMessageNotifications(conn.db, a.id)).toEqual([]);
    const one = await sendMessage(conn.txDb, a.id, id, "非公開の本文");
    const two = await sendMessage(conn.txDb, a.id, id, "もう一通");
    expect(await getMessageNotifications(conn.db, a.id)).toEqual([
      {
        conversationId: id,
        latestMessageId: two.id,
        latestIncomingId: null,
        unreadCount: 0,
      },
    ]);
    expect(await getMessageNotifications(conn.db, b.id)).toEqual([
      {
        conversationId: id,
        latestMessageId: two.id,
        latestIncomingId: two.id,
        unreadCount: 2,
      },
    ]);
    expect(await getMessageNotifications(conn.db, stranger.id)).toEqual([]);
    await markConversationRead(conn.db, b.id, id, two.id);
    expect((await getMessageNotifications(conn.db, b.id))[0]?.unreadCount).toBe(
      0,
    );
    const reply = await sendMessage(conn.txDb, b.id, id, "返信");
    expect((await getMessageNotifications(conn.db, a.id))[0]).toMatchObject({
      latestIncomingId: reply.id,
      unreadCount: 1,
    });
    await markConversationRead(conn.db, b.id, id, reply.id);
    expect((await getMessageNotifications(conn.db, a.id))[0]?.unreadCount).toBe(
      1,
    );
    const page = await getMessages(conn.db, a.id, id);
    expect(
      Object.keys(page.messages.find((m) => m.id === one.id) ?? {}).sort(),
    ).toEqual(["body", "createdAt", "id", "senderId"]);
  });

  it("取得済みの最新IDまでを既読にし、同時刻でも後続メッセージを未読に残す", async () => {
    const { a, b, id } = await pair();
    const time = new Date("2026-10-12T00:00:00.000Z");
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    await conn.db.insert(dmMessages).values(
      ids.map((messageId) => ({
        id: messageId,
        conversationId: id,
        senderId: a.id,
        body: "同時刻",
        createdAt: time,
      })),
    );
    await markConversationRead(conn.db, b.id, id, ids[1] ?? "");
    expect((await getMessageNotifications(conn.db, b.id))[0]?.unreadCount).toBe(
      1,
    );
    const firstRead = await conn.db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.id, ids[0] ?? ""));
    await markConversationRead(conn.db, b.id, id, ids[1] ?? "");
    const secondRead = await conn.db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.id, ids[0] ?? ""));
    expect(secondRead[0]?.readAt).toEqual(firstRead[0]?.readAt);
    await markConversationRead(conn.db, b.id, id, ids[2] ?? "");
    expect((await getMessageNotifications(conn.db, b.id))[0]?.unreadCount).toBe(
      0,
    );
  });

  it("第三者や別会話のIDを使って未読を消せない", async () => {
    const { a, b, id } = await pair();
    const other = await pair();
    const stranger = await insertUser(conn.db);
    const message = await sendMessage(conn.txDb, a.id, id, "消せない未読");
    const otherMessage = await sendMessage(
      conn.txDb,
      other.a.id,
      other.id,
      "別会話",
    );
    for (const [viewerId, lastId] of [
      [stranger.id, message.id],
      [b.id, otherMessage.id],
      [b.id, randomUUID()],
      [b.id, "invalid"],
    ]) {
      await expect(
        markConversationRead(conn.db, viewerId ?? "", id, lastId ?? ""),
      ).rejects.toMatchObject({ code: "conversation_not_found" });
    }
    expect((await getMessageNotifications(conn.db, b.id))[0]?.unreadCount).toBe(
      1,
    );
  });

  it("両者から同時に開始しても同じ会話になり、空の会話は一覧に出ない", async () => {
    const a = await insertUser(conn.db);
    const b = await insertUser(conn.db);
    const results = await Promise.all([
      startConversation(conn.db, a.id, b.id),
      startConversation(conn.db, b.id, a.id),
      startConversation(conn.db, a.id.toUpperCase(), b.id.toUpperCase()),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await listConversations(conn.db, a.id)).toEqual([]);
    expect(await listConversations(conn.db, b.id)).toEqual([]);
    const conversation = await getConversation(
      conn.db,
      b.id,
      results[0]?.id ?? "",
    );
    expect(conversation.peer).toMatchObject({
      id: a.id,
      username: a.username,
      deleted: false,
    });
  });

  it("未ログイン・存在しない・退会済みの利用者を全操作で拒否する", async () => {
    const { a, b, id } = await pair();
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, a.id));
    for (const viewer of [null, randomUUID(), a.id]) {
      for (const operation of [
        () => startConversation(conn.db, viewer, b.id),
        () => listConversations(conn.db, viewer),
        () => getMessageNotifications(conn.db, viewer),
        () => getConversation(conn.db, viewer, id),
        () => getMessages(conn.db, viewer, id),
        () => markConversationRead(conn.db, viewer, id, randomUUID()),
        () => sendMessage(conn.txDb, viewer, id, "秘密"),
      ])
        await expect(operation()).rejects.toMatchObject({
          code: "unauthorized",
        });
    }
  });

  it("自分自身・存在しない・不正・退会済みの相手との新規会話を拒否する", async () => {
    const { a, b } = await pair();
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, b.id));
    await expect(startConversation(conn.db, a.id, a.id)).rejects.toMatchObject({
      code: "validation",
    });
    for (const target of [randomUUID(), "bad-id", b.id]) {
      await expect(
        startConversation(conn.db, a.id, target),
      ).rejects.toMatchObject({ code: "user_not_found" });
    }
  });

  it("非参加者には存在しない会話と同じエラーを返し、取得・送信・一覧を漏らさない", async () => {
    const { a, id } = await pair();
    const stranger = await insertUser(conn.db);
    await sendMessage(conn.txDb, a.id, id, "秘密の待ち合わせ");
    for (const target of [id, randomUUID(), "bad-id"]) {
      await expect(
        getConversation(conn.db, stranger.id, target),
      ).rejects.toMatchObject({
        code: "conversation_not_found",
        message: "会話が見つかりません",
      });
      await expect(
        getMessages(conn.db, stranger.id, target),
      ).rejects.toMatchObject({ code: "conversation_not_found" });
      await expect(
        sendMessage(conn.txDb, stranger.id, target, "なりすまし"),
      ).rejects.toMatchObject({ code: "conversation_not_found" });
    }
    expect(await listConversations(conn.db, stranger.id)).toEqual([]);
    expect((await getMessages(conn.db, a.id, id)).messages).toHaveLength(1);
  });

  it("送受信・返信を保存し、本文を正規化してハッシュタグを公開しない", async () => {
    const { a, b, id } = await pair();
    const beforePosts = await conn.db.select().from(posts);
    const beforeTags = await conn.db.select().from(postTags);
    const message = await sendMessage(
      conn.txDb,
      a.id,
      id,
      "  待ち合わせ\r\n#秘密  ",
    );
    const reply = await sendMessage(conn.txDb, b.id, id, "了解！");
    expect(message).toMatchObject({
      body: "待ち合わせ\n#秘密",
      senderId: a.id,
    });
    expect(
      (await getMessages(conn.db, b.id, id)).messages.map((m) => m.id).sort(),
    ).toEqual([message.id, reply.id].sort());
    expect(await conn.db.select().from(posts)).toEqual(beforePosts);
    expect(await conn.db.select().from(postTags)).toEqual(beforeTags);
  });

  it("空白だけ・上限超過を拒否し、絵文字280文字は送れる", async () => {
    const { a, id } = await pair();
    for (const body of ["", " \r\n\t ", "あ".repeat(281), "😀".repeat(281)]) {
      await expect(
        sendMessage(conn.txDb, a.id, id, body),
      ).rejects.toMatchObject({ code: "validation" });
    }
    expect(
      (await sendMessage(conn.txDb, a.id, id, "😀".repeat(280))).body,
    ).toBe("😀".repeat(280));
    expect((await getMessages(conn.db, a.id, id)).messages).toHaveLength(1);
  });

  it("最新メッセージ順に会話一覧を返し、参加していない会話を含めない", async () => {
    const { a, b, id } = await pair();
    const c = await insertUser(conn.db);
    const other = await startConversation(conn.db, a.id, c.id);
    const ab = await sendMessage(conn.txDb, b.id, id, "前の会話");
    const ac = await sendMessage(conn.txDb, c.id, other.id, "最新の会話");
    await conn.db
      .update(dmMessages)
      .set({ createdAt: new Date("2026-10-01T00:00:00Z") })
      .where(eq(dmMessages.id, ab.id));
    await conn.db
      .update(dmMessages)
      .set({ createdAt: new Date("2026-10-02T00:00:00Z") })
      .where(eq(dmMessages.id, ac.id));
    expect(
      (await listConversations(conn.db, a.id)).map((row) => [
        row.id,
        row.latest.body,
      ]),
    ).toEqual([
      [other.id, "最新の会話"],
      [id, "前の会話"],
    ]);
    expect(
      (await listConversations(conn.db, b.id)).map((row) => row.id),
    ).toEqual([id]);
  });

  it("同時刻の履歴も欠落・重複なくページングし、新着追加で過去のカーソルがずれない", async () => {
    const { a, id } = await pair();
    const time = new Date("2026-10-01T00:00:00.123Z");
    const ids = Array.from({ length: 45 }, () => randomUUID()).sort();
    await conn.db.insert(dmMessages).values(
      ids.map((messageId) => ({
        id: messageId,
        conversationId: id,
        senderId: a.id,
        body: messageId,
        createdAt: time,
      })),
    );
    const first = await getMessages(conn.db, a.id, id);
    expect(first.messages.map((m) => m.id)).toEqual(ids.slice(25));
    await sendMessage(conn.txDb, a.id, id, "新着");
    const second = await getMessages(conn.db, a.id, id, {
      cursor: first.nextCursor ?? "",
    });
    const third = await getMessages(conn.db, a.id, id, {
      cursor: second.nextCursor ?? "",
    });
    expect(
      [...third.messages, ...second.messages, ...first.messages].map(
        (m) => m.id,
      ),
    ).toEqual(ids);
    expect(third.nextCursor).toBeNull();
    for (const input of [{ cursor: "invalid" }, { limit: 0 }, { limit: 51 }]) {
      await expect(getMessages(conn.db, a.id, id, input)).rejects.toMatchObject(
        { code: "validation" },
      );
    }
  });

  it("相手が退会しても履歴を保持し、名前とリンクを隠して送信を拒否する", async () => {
    const { a, b, id } = await pair();
    await sendMessage(conn.txDb, b.id, id, "退会前のメッセージ");
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, b.id));
    const page = await getMessages(conn.db, a.id, id);
    expect(page.conversation.peer).toMatchObject({
      displayName: "退会済みユーザー",
      username: null,
      deleted: true,
    });
    expect(page.messages).toHaveLength(1);
    expect(
      (await listConversations(conn.db, a.id))[0]?.peer.username,
    ).toBeNull();
    await expect(
      sendMessage(conn.txDb, a.id, id, "送れない"),
    ).rejects.toMatchObject({ code: "user_not_found" });
  });

  it("DB制約でも自己会話・逆順・重複ペアを拒否し、削除は履歴へ追従する", async () => {
    const { a, b, id } = await pair();
    const [low, high] = [a.id, b.id].sort() as [string, string];
    for (const [userLowId, userHighId] of [
      [low, low],
      [high, low],
      [low, high],
    ] as [string, string][]) {
      await expect(
        conn.db.insert(dmConversations).values({ userLowId, userHighId }),
      ).rejects.toThrow();
    }
    const message = await sendMessage(conn.txDb, a.id, id, "削除テスト");
    await conn.db.delete(users).where(inArray(users.id, [a.id, b.id]));
    expect(
      await conn.db
        .select()
        .from(dmConversations)
        .where(eq(dmConversations.id, id)),
    ).toEqual([]);
    expect(
      await conn.db
        .select()
        .from(dmMessages)
        .where(eq(dmMessages.id, message.id)),
    ).toEqual([]);
  });
});
