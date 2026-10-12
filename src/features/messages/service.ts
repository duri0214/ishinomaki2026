import { and, desc, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { dmConversations, dmMessages, users } from "@/db/schema";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { AppError } from "@/lib/errors";
import type {
  Conversation,
  ConversationSummary,
  Message,
  MessageNotification,
  MessagePage,
} from "./types";
import {
  conversationIdSchema,
  messageBodySchema,
  messageQuerySchema,
} from "./validation";

function notFound(): never {
  // 存在しないID・不正なID・非参加者を区別しない。
  throw new AppError("conversation_not_found", "会話が見つかりません");
}

/** 呼び出し側はセッションからIDを渡す。serviceでも退会済み・存在しない利用者を拒否する。 */
async function requireActiveUser(db: Db, viewerId: string | null) {
  const parsed = conversationIdSchema.safeParse(viewerId);
  if (!parsed.success) throw new AppError("unauthorized", "ログインが必要です");
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, parsed.data), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw new AppError("unauthorized", "ログインが必要です");
  return user.id;
}

function peerDto(peer: typeof users.$inferSelect): Conversation["peer"] {
  return {
    id: peer.id,
    username: peer.deletedAt ? null : peer.username,
    displayName: peer.deletedAt ? "退会済みユーザー" : peer.displayName,
    deleted: peer.deletedAt !== null,
  };
}

function messageDto(message: typeof dmMessages.$inferSelect): Message {
  return {
    id: message.id,
    senderId: message.senderId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function startConversation(
  db: Db,
  viewerId: string | null,
  recipientId: string,
): Promise<{ id: string }> {
  const me = await requireActiveUser(db, viewerId);
  const parsed = conversationIdSchema.safeParse(recipientId);
  if (!parsed.success)
    throw new AppError("user_not_found", "ユーザーが見つかりません");
  if (parsed.data === me)
    throw new AppError("validation", "自分自身にはDMを送れません");
  const [recipient] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, parsed.data), isNull(users.deletedAt)))
    .limit(1);
  if (!recipient)
    throw new AppError("user_not_found", "ユーザーが見つかりません");
  const [userLowId, userHighId] = [me, recipient.id].sort() as [string, string];
  const [created] = await db
    .insert(dmConversations)
    .values({ userLowId, userHighId })
    .onConflictDoNothing({
      target: [dmConversations.userLowId, dmConversations.userHighId],
    })
    .returning({ id: dmConversations.id });
  if (created) return created;
  const [existing] = await db
    .select({ id: dmConversations.id })
    .from(dmConversations)
    .where(
      and(
        eq(dmConversations.userLowId, userLowId),
        eq(dmConversations.userHighId, userHighId),
      ),
    )
    .limit(1);
  if (!existing) notFound();
  return existing;
}

export async function getConversation(
  db: Db,
  viewerId: string | null,
  conversationId: string,
): Promise<Conversation> {
  const me = await requireActiveUser(db, viewerId);
  const parsed = conversationIdSchema.safeParse(conversationId);
  if (!parsed.success) notFound();
  const [row] = await db
    .select()
    .from(dmConversations)
    .where(
      and(
        eq(dmConversations.id, parsed.data),
        or(
          eq(dmConversations.userLowId, me),
          eq(dmConversations.userHighId, me),
        ),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const peerId = row.userLowId === me ? row.userHighId : row.userLowId;
  const [peer] = await db
    .select()
    .from(users)
    .where(eq(users.id, peerId))
    .limit(1);
  if (!peer) notFound();
  return { id: row.id, peer: peerDto(peer) };
}

export async function listConversations(
  db: Db,
  viewerId: string | null,
): Promise<ConversationSummary[]> {
  const me = await requireActiveUser(db, viewerId);
  // 各会話の最新1件をインデックスで探す。空の会話を除外し、N+1を避ける。
  const rows = await db
    .select({ id: dmConversations.id, peer: users, latest: dmMessages })
    .from(dmConversations)
    .innerJoin(
      users,
      eq(
        users.id,
        sql`case when ${dmConversations.userLowId} = ${me} then ${dmConversations.userHighId} else ${dmConversations.userLowId} end`,
      ),
    )
    .innerJoin(
      dmMessages,
      eq(
        dmMessages.id,
        sql`(select m.id from dm_messages m where m.conversation_id = ${dmConversations.id} order by m.created_at desc, m.id desc limit 1)`,
      ),
    )
    .where(
      or(eq(dmConversations.userLowId, me), eq(dmConversations.userHighId, me)),
    )
    .orderBy(desc(dmMessages.createdAt), desc(dmMessages.id));
  return rows.map((row) => ({
    id: row.id,
    peer: peerDto(row.peer),
    latest: messageDto(row.latest),
  }));
}

export async function getMessages(
  db: Db,
  viewerId: string | null,
  conversationId: string,
  input: { cursor?: string; limit?: number } = {},
): Promise<MessagePage> {
  const conversation = await getConversation(db, viewerId, conversationId);
  const parsed = messageQuerySchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "リクエストが不正です",
    );
  const { limit } = parsed.data;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  const rows = await db
    .select()
    .from(dmMessages)
    .where(
      and(
        eq(dmMessages.conversationId, conversation.id),
        cursor
          ? or(
              lt(dmMessages.createdAt, cursor.createdAt),
              and(
                eq(dmMessages.createdAt, cursor.createdAt),
                lt(dmMessages.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(dmMessages.createdAt), desc(dmMessages.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const oldest = page[page.length - 1];
  return {
    conversation,
    messages: page.reverse().map(messageDto),
    nextCursor: rows.length > limit && oldest ? encodeCursor(oldest) : null,
  };
}

export async function getMessageNotifications(
  db: Db,
  viewerId: string | null,
): Promise<MessageNotification[]> {
  const me = await requireActiveUser(db, viewerId);
  // 最新IDは履歴インデックス、未読数は部分インデックスを使う。本文を取得しない。
  const rows = await db
    .select({
      conversationId: dmConversations.id,
      latestMessageId: dmMessages.id,
      latestIncomingId: sql<
        string | null
      >`(select m.id from dm_messages m where m.conversation_id = ${dmConversations.id} and m.sender_id <> ${me} order by m.created_at desc, m.id desc limit 1)`,
      unreadCount: sql<number>`(select count(*)::int from dm_messages m where m.conversation_id = ${dmConversations.id} and m.sender_id <> ${me} and m.read_at is null)`,
    })
    .from(dmConversations)
    .innerJoin(
      dmMessages,
      eq(
        dmMessages.id,
        sql`(select m.id from dm_messages m where m.conversation_id = ${dmConversations.id} order by m.created_at desc, m.id desc limit 1)`,
      ),
    )
    .where(
      or(eq(dmConversations.userLowId, me), eq(dmConversations.userHighId, me)),
    );
  return rows;
}

/** 実際に画面で取得したメッセージまでを既読にする。後から届くメッセージは更新しない。 */
export async function markConversationRead(
  db: Db,
  viewerId: string | null,
  conversationId: string,
  lastMessageId: string,
): Promise<void> {
  const conversation = await getConversation(db, viewerId, conversationId);
  const parsed = conversationIdSchema.safeParse(lastMessageId);
  if (!parsed.success) notFound();
  const [last] = await db
    .select({ id: dmMessages.id, createdAt: dmMessages.createdAt })
    .from(dmMessages)
    .where(
      and(
        eq(dmMessages.conversationId, conversation.id),
        eq(dmMessages.id, parsed.data),
      ),
    )
    .limit(1);
  if (!last) notFound();
  await db
    .update(dmMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(dmMessages.conversationId, conversation.id),
        ne(dmMessages.senderId, viewerId as string),
        isNull(dmMessages.readAt),
        or(
          lt(dmMessages.createdAt, last.createdAt),
          and(
            eq(dmMessages.createdAt, last.createdAt),
            lte(dmMessages.id, last.id),
          ),
        ),
      ),
    );
}

/** トランザクション対応DBを渡す。送信者はセッションのユーザーIDのみ。 */
export async function sendMessage(
  db: Db,
  viewerId: string | null,
  conversationId: string,
  body: string,
): Promise<Message> {
  return db.transaction(async (tx) => {
    const conversation = await getConversation(tx, viewerId, conversationId);
    if (conversation.peer.deleted)
      throw new AppError(
        "user_not_found",
        "退会済みユーザーには送信できません",
      );
    const parsed = messageBodySchema.safeParse(body);
    if (!parsed.success)
      throw new AppError(
        "validation",
        parsed.error.issues[0]?.message ?? "本文が不正です",
      );
    const [message] = await tx
      .insert(dmMessages)
      .values({
        conversationId: conversation.id,
        senderId: viewerId as string,
        body: parsed.data,
      })
      .returning();
    if (!message) throw new Error("DMを保存できませんでした");
    return messageDto(message);
  });
}
