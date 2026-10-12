"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { MessageComposer } from "./MessageComposer";
import {
  NotificationSoundButton,
  useMessageNotifications,
} from "./MessageNotifications";
import type { Message } from "./types";
import {
  PrivateMessageError,
  useConversations,
  useMessages,
} from "./useMessages";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function MessagesLogin() {
  const openAuth = useAuthDialog();
  return (
    <div className="p-6 text-sm text-[var(--ui-muted)]">
      <p>メッセージを使うにはログインしてください。</p>
      <button
        type="button"
        className="mt-3 font-bold text-[var(--ui-accent)] underline"
        onClick={() =>
          openAuth({
            mode: "signin",
            reason: "DMを使うにはアカウントが必要です",
          })
        }
      >
        ログイン・新規登録
      </button>
    </div>
  );
}

function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="px-4 py-3 text-sm text-[var(--ui-danger)]">
      <p>{error.message}</p>
      <button type="button" className="mt-2 underline" onClick={retry}>
        もう一度試す
      </button>
    </div>
  );
}

/** 古いルーター履歴に残ったページでも、現在の閲覧者と一致しなければ私的データを描画しない。 */
export function MessagesView({
  ownerId,
  conversationId,
}: {
  ownerId: string;
  conversationId?: string;
}) {
  const { user } = useViewer();
  if (user?.id !== ownerId) return <MessagesLogin />;
  return conversationId ? (
    <ConversationView
      key={`${ownerId}:${conversationId}`}
      viewerId={ownerId}
      conversationId={conversationId}
    />
  ) : (
    <InboxView viewerId={ownerId} />
  );
}

function InboxView({ viewerId }: { viewerId: string }) {
  const query = useConversations(viewerId);
  const notifications = useMessageNotifications();
  return (
    <section
      aria-label="メッセージ一覧"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="font-serif text-lg font-bold text-[var(--ui-title)]">
            メッセージ
          </h1>
          <p className="mt-1 text-xs text-[var(--ui-muted)]">
            ふたりだけの会話
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationSoundButton />
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="text-sm text-[var(--ui-accent)] disabled:opacity-50"
          >
            更新
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {query.isPending && (
          <p role="status" className="py-4 text-sm text-[var(--ui-muted)]">
            読み込み中…
          </p>
        )}
        {query.isError && (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        )}
        {!query.isError && query.data?.conversations.length === 0 && (
          <div className="design-card text-sm text-[var(--ui-muted)]">
            <p>まだメッセージはありません</p>
            <p className="mt-2">相手のプロフィールから会話を始められます。</p>
          </div>
        )}
        {!query.isError && (
          <ul aria-label="会話" className="flex flex-col gap-3">
            {query.data?.conversations.map(({ id, peer, latest }) => (
              <li key={id}>
                <Link
                  prefetch={false}
                  href={`/messages/${id}`}
                  className="design-card block hover:border-[var(--ui-accent)]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold text-[var(--ui-title)]">
                      {peer.displayName}
                    </span>
                    {notifications.conversations.some(
                      (row) => row.conversationId === id && row.unreadCount > 0,
                    ) && (
                      <span
                        role="img"
                        className="size-2 shrink-0 rounded-full bg-rose-600"
                        aria-label="未読"
                      />
                    )}
                    <time
                      dateTime={latest.createdAt}
                      className="shrink-0 text-[10px] text-[var(--ui-muted)]"
                    >
                      {dateFormat.format(new Date(latest.createdAt))}
                    </time>
                  </div>
                  {peer.username && (
                    <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                      @{peer.username}
                    </p>
                  )}
                  <p className="mt-2 truncate text-sm text-[var(--ui-text)]">
                    {latest.senderId === viewerId ? "あなた: " : ""}
                    {latest.body}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConversationView({
  viewerId,
  conversationId,
}: {
  viewerId: string;
  conversationId: string;
}) {
  const query = useMessages(viewerId, conversationId);
  const { visible, markRead } = useMessageNotifications();
  const scroller = useRef<HTMLDivElement>(null);
  const page = query.data?.pages[0];
  const latestId = page?.messages[page.messages.length - 1]?.id;
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !latestId || marked.current === latestId || query.isError)
      return;
    let alive = true;
    void markRead(conversationId, latestId).then((ok) => {
      if (ok && alive) marked.current = latestId;
    });
    return () => {
      alive = false;
    };
  }, [conversationId, latestId, visible, markRead, query.isError]);
  useEffect(() => {
    if (latestId && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [latestId]);
  const peer = page?.conversation.peer;
  const blocked =
    query.error instanceof PrivateMessageError &&
    [401, 403, 404].includes(query.error.status);
  const messages = Array.from(
    new Map(
      query.data?.pages.flatMap((p) => p.messages).map((m) => [m.id, m]),
    ).values(),
  ).sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

  const older = async () => {
    const el = scroller.current;
    const height = el?.scrollHeight ?? 0;
    const top = el?.scrollTop ?? 0;
    await query.fetchNextPage();
    requestAnimationFrame(() => {
      if (el) el.scrollTop = top + el.scrollHeight - height;
    });
  };

  return (
    <section aria-label="会話" className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-4 pb-2 pt-1">
        <Link
          href="/messages"
          prefetch={false}
          className="text-xs text-[var(--ui-accent)] hover:underline"
        >
          ← メッセージ一覧
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold text-[var(--ui-title)]">
              {!blocked && peer ? (
                peer.username ? (
                  <Link
                    href={`/u/${peer.username}`}
                    className="hover:underline"
                  >
                    {peer.displayName}
                  </Link>
                ) : (
                  peer.displayName
                )
              ) : (
                "メッセージ"
              )}
            </h1>
            {!blocked && peer?.username && (
              <p className="text-xs text-[var(--ui-muted)]">@{peer.username}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationSoundButton />
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="text-sm text-[var(--ui-accent)] disabled:opacity-50"
            >
              更新
            </button>
          </div>
        </div>
      </header>
      {query.isError && (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      )}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {query.isPending && (
          <p role="status" className="text-sm text-[var(--ui-muted)]">
            読み込み中…
          </p>
        )}
        {!blocked && query.hasNextPage && (
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => void older()}
            className="my-2 w-full rounded-full bg-[var(--ui-hover)] py-2 text-xs text-[var(--ui-accent)] disabled:opacity-50"
          >
            {query.isFetchingNextPage
              ? "読み込み中…"
              : "過去のメッセージを表示"}
          </button>
        )}
        {!blocked && page && messages.length === 0 && (
          <p className="py-4 text-sm text-[var(--ui-muted)]">
            まだメッセージはありません。最初のメッセージを送ってみましょう。
          </p>
        )}
        {!blocked && (
          <ol aria-label="メッセージ履歴" className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                mine={message.senderId === viewerId}
                name={
                  message.senderId === viewerId
                    ? "あなた"
                    : (peer?.displayName ?? "相手")
                }
              />
            ))}
          </ol>
        )}
      </div>
      {!blocked &&
        peer &&
        (peer.deleted ? (
          <p className="mx-4 mb-4 shrink-0 text-sm text-[var(--ui-muted)]">
            退会済みユーザーには送信できません。
          </p>
        ) : (
          <MessageComposer conversationId={conversationId} />
        ))}
    </section>
  );
}

function MessageItem({
  message,
  mine,
  name,
}: {
  message: Message;
  mine: boolean;
  name: string;
}) {
  return (
    <li
      data-testid="message-item"
      className={`max-w-[90%] rounded-[var(--ui-radius-surface)] px-3 py-2 ${mine ? "self-end bg-[var(--ui-accent)] text-[var(--ui-on-accent)]" : "self-start border border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)]"}`}
    >
      <p className="text-[10px] opacity-80">{name}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
        {message.body}
      </p>
      <time
        dateTime={message.createdAt}
        className="mt-1 block text-right text-[10px] opacity-80"
      >
        {dateFormat.format(new Date(message.createdAt))}
      </time>
    </li>
  );
}
