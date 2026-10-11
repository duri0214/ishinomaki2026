"use client";

import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { TimelinePage, TimelinePost } from "./queries";

/** タイムラインの種類: 全島(なし) / 島 / 島＋タグ。tag は正規化済みのタグ名 */
export type TimelineScopeKey = { island?: string; tag?: string };

export const TIMELINE_KEY = "timeline";

export const timelineQueryKey = (scope: TimelineScopeKey) =>
  [TIMELINE_KEY, scope.island ?? null, scope.tag ?? null] as const;

async function fetchPage(
  scope: TimelineScopeKey,
  cursor: string | null,
): Promise<TimelinePage> {
  const params = new URLSearchParams();
  if (scope.island) params.set("island", scope.island);
  if (scope.tag) params.set("tag", scope.tag);
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/timeline?${params}`);
  if (!res.ok)
    throw new Error(`タイムラインを読み込めませんでした (${res.status})`);
  return res.json();
}

export function useTimeline(
  scope: TimelineScopeKey,
  initialPage?: TimelinePage,
) {
  return useInfiniteQuery({
    queryKey: timelineQueryKey(scope),
    queryFn: ({ pageParam }) => fetchPage(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
  });
}

type Timelines = InfiniteData<TimelinePage, string | null>;

/** キャッシュ中の全タイムラインから、指定の投稿を書き換える（null を返すと取り除く） */
export function patchPostInCaches(
  queryClient: QueryClient,
  postId: string,
  update: (post: TimelinePost) => TimelinePost | null,
) {
  queryClient.setQueriesData<Timelines>({ queryKey: [TIMELINE_KEY] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        posts: page.posts.flatMap((p) => {
          if (p.id !== postId) return [p];
          const next = update(p);
          return next ? [next] : [];
        }),
      })),
    };
  });
}
