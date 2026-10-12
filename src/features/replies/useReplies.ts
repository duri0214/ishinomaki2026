"use client";

import { useQuery } from "@tanstack/react-query";
import type { TimelinePost } from "@/features/timeline/queries";

export const REPLIES_KEY = "replies";

export const repliesQueryKey = (postId: string) =>
  [REPLIES_KEY, postId] as const;

async function fetchReplies(postId: string): Promise<TimelinePost[]> {
  const res = await fetch(`/api/posts/${postId}/replies`);
  if (!res.ok) throw new Error(`返信を読み込めませんでした (${res.status})`);
  const body: { replies: TimelinePost[] } = await res.json();
  return body.replies;
}

/** 投稿への返信(古い順)。スレッドを開いたときだけ読み込む */
export function useReplies(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: repliesQueryKey(postId),
    queryFn: () => fetchReplies(postId),
    enabled,
  });
}
