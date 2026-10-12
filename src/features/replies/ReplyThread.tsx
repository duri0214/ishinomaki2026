"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { deletePostAction } from "@/features/posts/actions";
import { Composer } from "@/features/posts/Composer";
import { PostBody } from "@/features/posts/PostBody";
import type { TimelinePost } from "@/features/timeline/queries";
import { patchPostInCaches } from "@/features/timeline/useTimeline";
import { repliesQueryKey, useReplies } from "./useReplies";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function ReplyItem({
  reply,
  parent,
}: {
  reply: TimelinePost;
  parent: TimelinePost;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    if (!window.confirm("この返信を削除しますか？")) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deletePostAction(reply.id);
      if (result.ok) {
        patchPostInCaches(queryClient, parent.id, (p) => ({
          ...p,
          replyCount: Math.max(0, p.replyCount - 1),
        }));
      } else {
        setError(result.message);
      }
      await queryClient.invalidateQueries({
        queryKey: repliesQueryKey(parent.id),
      });
    } catch {
      setError("削除できませんでした");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <li
      className="rounded-2xl bg-[var(--ui-hover)] px-3 py-2"
      data-testid="reply-item"
    >
      <p className="flex items-center gap-2 text-xs text-[var(--ui-muted)]">
        <span className="truncate font-bold text-[var(--ui-title)]">
          {reply.author.username ? (
            <Link
              href={`/u/${reply.author.username}`}
              className="hover:text-[var(--ui-accent)] hover:underline"
            >
              {reply.author.displayName}
            </Link>
          ) : (
            reply.author.displayName
          )}
        </span>
        <time dateTime={reply.createdAt}>
          {dateFormat.format(new Date(reply.createdAt))}
        </time>
        {reply.isMine && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="返信を削除"
            className="ml-auto rounded px-1.5 py-0.5 hover:text-[var(--ui-danger)] disabled:opacity-50"
          >
            削除
          </button>
        )}
      </p>
      <div className="mt-1 text-sm">
        <PostBody body={reply.body} islandSlug={reply.island.slug} />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </li>
  );
}

/** 投稿カードの下に開く、返信の一覧と返信フォーム */
export function ReplyThread({ post }: { post: TimelinePost }) {
  const query = useReplies(post.id, true);
  const replies = query.data ?? [];

  return (
    <section
      aria-label="返信"
      className="mt-3 flex flex-col gap-2 border-t border-[var(--ui-border)] pt-3"
      data-testid="reply-thread"
    >
      {query.isPending && (
        <p className="text-xs text-[var(--ui-muted)]">読み込み中…</p>
      )}
      {query.isError && (
        <p role="alert" className="text-xs text-rose-600">
          返信を読み込めませんでした。
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => query.refetch()}
          >
            もう一度試す
          </button>
        </p>
      )}
      {query.isSuccess && replies.length === 0 && (
        <p className="text-xs text-[var(--ui-muted)]">まだ返信がありません</p>
      )}
      {replies.length > 0 && (
        <ul className="flex flex-col gap-2">
          {replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} parent={post} />
          ))}
        </ul>
      )}
      <Composer islandSlug={post.island.slug} replyTo={post.id} />
    </section>
  );
}
