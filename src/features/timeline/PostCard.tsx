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

/** アイコンの色。表示名から決めるので、同じ人はいつも同じ色になる */
const AVATARS = [
  "from-[#c9a5e0] to-[#8f6ab3]",
  "from-[#f0b6c8] to-[#c97b9b]",
  "from-[#f3c7a6] to-[#d58f6a]",
  "from-[#a9c4ec] to-[#6f8fc9]",
  "from-[#b4d9c4] to-[#6fa88a]",
] as const;

function avatarClass(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATARS[hash % AVATARS.length] ?? AVATARS[0];
}

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
      className="rounded-[28px] border border-[#ece4ef] bg-white p-4 shadow-[0_10px_28px_-16px_rgba(111,78,142,0.35)]"
      data-testid="post-card"
    >
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-serif text-base font-bold text-white ${avatarClass(post.author.displayName)}`}
        >
          {Array.from(post.author.displayName)[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-[#3f3158]">
            {post.author.displayName}
          </p>
          <p className="truncate text-[11px] leading-tight text-[#a79bb8]">
            {showIsland && (
              <>
                <Link
                  href={`/i/${post.island.slug}`}
                  className="hover:text-[#8e6bb0] hover:underline"
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
        {post.isMine && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="削除"
            title="削除"
            className="ml-auto flex size-8 items-center justify-center rounded-full text-[#a79bb8] hover:bg-[#f6f0fa] hover:text-[#c4456f] disabled:opacity-50"
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
    </article>
  );
}
