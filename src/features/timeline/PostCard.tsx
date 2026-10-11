"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { LikeButton } from "@/features/likes/LikeButton";
import { deletePostAction } from "@/features/posts/actions";
import { PostBody } from "@/features/posts/PostBody";
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
  /** 全島タイムラインでは、どの島の投稿か分かるバッジを付ける */
  showIsland: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    <article
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      data-testid="post-card"
    >
      <header className="mb-1 flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800"
        >
          {Array.from(post.author.displayName)[0]}
        </span>
        <span className="font-bold">{post.author.displayName}</span>
        {showIsland && (
          <Link
            href={`/i/${post.island.slug}`}
            className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-200"
          >
            {post.island.name}
          </Link>
        )}
        <time
          dateTime={post.createdAt}
          className="ml-auto text-xs text-slate-500"
        >
          {dateFormat.format(new Date(post.createdAt))}
        </time>
      </header>
      <PostBody body={post.body} islandSlug={post.island.slug} />
      <footer className="mt-1 flex items-center gap-2">
        <LikeButton post={post} />
        {post.isMine && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
          >
            削除
          </button>
        )}
      </footer>
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </article>
  );
}
