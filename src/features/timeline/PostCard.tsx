"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { LikeButton } from "@/features/likes/LikeButton";
import { deletePostAction } from "@/features/posts/actions";
import { PostBody } from "@/features/posts/PostBody";
import { ReplyThread } from "@/features/replies/ReplyThread";
import { avatarClass } from "./avatar";
import type { TimelinePost } from "./queries";
import { patchPostInCaches } from "./useTimeline";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function PostCard({
  post,
  showIsland,
}: {
  post: TimelinePost;
  /** 全島タイムラインでは、どの島の投稿か分かるように島名を添える */
  showIsland: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);

  const onDelete = async () => {
    if (!window.confirm("この投稿を削除しますか？")) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deletePostAction(post.id);
      if (result.ok) {
        patchPostInCaches(queryClient, post.id, () => null);
        queryClient.invalidateQueries({ queryKey: ["timeline"] });
      } else {
        setError(result.message);
      }
    } catch {
      setError("削除できませんでした");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="design-card design-post" data-testid="post-card">
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`design-avatar flex size-9 shrink-0 items-center justify-center bg-gradient-to-br font-serif text-base font-bold text-white ${avatarClass(post.author.displayName)}`}
        >
          {Array.from(post.author.displayName)[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-[var(--ui-title)]">
            {post.author.username ? (
              <Link
                href={`/u/${post.author.username}`}
                className="hover:text-[var(--ui-accent)] hover:underline"
              >
                {post.author.displayName}
              </Link>
            ) : (
              post.author.displayName
            )}
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--ui-muted)]">
            {showIsland && (
              <>
                <Link
                  href={`/i/${post.island.slug}`}
                  className="hover:text-[var(--ui-accent)] hover:underline"
                >
                  {post.island.name}
                </Link>
                {" · "}
              </>
            )}
            <time dateTime={post.createdAt}>
              {dateFormat.format(new Date(post.createdAt))}
            </time>
          </p>
        </div>
      </header>
      <div className="mt-2">
        <PostBody body={post.body} islandSlug={post.island.slug} />
      </div>
      <footer className="mt-3 flex items-center gap-2">
        <LikeButton post={post} />
        <button
          type="button"
          onClick={() => setRepliesOpen((open) => !open)}
          aria-expanded={repliesOpen}
          aria-label={repliesOpen ? "返信を閉じる" : "返信を表示"}
          data-testid="reply-toggle"
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm transition-colors hover:bg-[var(--ui-hover)] ${
            repliesOpen ? "text-[var(--ui-accent)]" : "text-[var(--ui-muted)]"
          }`}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />
          </svg>
          <span data-testid="reply-count">{post.replyCount}</span>
        </button>
        {post.isMine && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="削除"
            title="削除"
            className="ml-auto flex size-8 items-center justify-center rounded-full text-[var(--ui-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ui-danger)] disabled:opacity-50"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
            </svg>
          </button>
        )}
      </footer>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
      {repliesOpen && <ReplyThread post={post} />}
    </article>
  );
}
