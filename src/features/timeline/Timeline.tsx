"use client";

import { useCallback, useEffect, useRef } from "react";
import { PostCard } from "./PostCard";
import type { TimelinePage } from "./queries";
import { type TimelineScopeKey, useTimeline } from "./useTimeline";

/** 無限スクロールのタイムライン。この領域だけがスクロールする */
export function Timeline({
  scope,
  initialPage,
  emptyMessage = "まだ投稿がありません",
}: {
  scope: TimelineScopeKey;
  initialPage?: TimelinePage;
  emptyMessage?: string;
}) {
  const query = useTimeline(scope, initialPage);
  const containerRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // 下端まで400px以内になったら続きを読み込む。
  // 内容が領域より短いときにも読み込めるよう、描画のたびに確認する
  const loadMoreIfNearEnd = useCallback(() => {
    const el = containerRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    // 非表示のタイムライン（戻る操作用に残っている前のページ）は読み込まない
    if (el.clientHeight === 0) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  useEffect(() => {
    loadMoreIfNearEnd();
  });

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <div
      ref={containerRef}
      onScroll={loadMoreIfNearEnd}
      className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"
      data-testid="timeline"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2 py-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>新しい順</span>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
          >
            {query.isFetching && !isFetchingNextPage ? "更新中…" : "↻ 更新"}
          </button>
        </div>

        {query.isError && posts.length === 0 && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            タイムラインを読み込めませんでした。
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => query.refetch()}
            >
              もう一度試す
            </button>
          </div>
        )}

        {posts.length === 0 && !query.isError && !query.isPending && (
          <p className="py-8 text-center text-sm text-slate-500">
            {emptyMessage}
          </p>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} showIsland={!scope.island} />
        ))}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mx-auto rounded-full border border-slate-300 px-4 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetchingNextPage ? "読み込み中…" : "もっと見る"}
          </button>
        )}
        {query.isError && posts.length > 0 && (
          <p role="alert" className="text-center text-xs text-rose-600">
            続きを読み込めませんでした
          </p>
        )}
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden px-3 py-2" aria-hidden>
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {["a", "b", "c", "d"].map((k) => (
          <div
            key={k}
            className="h-20 animate-pulse rounded-xl bg-slate-200/70"
          />
        ))}
      </div>
    </div>
  );
}
