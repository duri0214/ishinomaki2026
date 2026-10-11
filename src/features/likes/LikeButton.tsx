"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import type { TimelinePost } from "@/features/timeline/queries";
import { patchPostInCaches } from "@/features/timeline/useTimeline";
import { setLikeAction } from "./actions";

export function LikeButton({ post }: { post: TimelinePost }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const viewer = useViewer();
  const [message, setMessage] = useState<string | null>(null);
  const mutationKey = ["like", post.id];

  const mutation = useMutation({
    mutationKey,
    // 同じ投稿へのリクエストは順番に1つずつ送る（連打しても到着順がずれない）
    scope: { id: `like:${post.id}` },
    mutationFn: (liked: boolean) => setLikeAction({ postId: post.id, liked }),
    onMutate: (liked) => {
      // 画面は先に更新する（楽観的更新）。既に望む状態なら何もしない
      patchPostInCaches(queryClient, post.id, (p) =>
        p.likedByMe === liked
          ? p
          : {
              ...p,
              likedByMe: liked,
              likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)),
            },
      );
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setMessage(result.message);
        if (result.code === "unauthorized") router.push("/sign-in");
        queryClient.invalidateQueries({ queryKey: ["timeline"] });
        return;
      }
      setMessage(null);
      // 他の送信が残っていないときだけ、サーバーの件数に合わせる
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        patchPostInCaches(queryClient, post.id, (p) => ({
          ...p,
          likedByMe: result.data.liked,
          likeCount: result.data.likeCount,
        }));
      }
    },
    onError: () => {
      setMessage("いいねできませんでした");
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
    },
  });

  const onClick = () => {
    if (!viewer.signedIn) {
      if (viewer.authEnabled) router.push("/sign-in");
      else setMessage("ログインが設定されていないため、いいねできません");
      return;
    }
    mutation.mutate(!post.likedByMe);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={post.likedByMe}
        aria-label={post.likedByMe ? "いいねを取り消す" : "いいね"}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors hover:bg-rose-50 ${
          post.likedByMe ? "text-rose-600" : "text-slate-500"
        }`}
      >
        <span aria-hidden>{post.likedByMe ? "♥" : "♡"}</span>
        <span data-testid="like-count">{post.likeCount}</span>
      </button>
      {message && (
        <span role="alert" className="text-xs text-rose-600">
          {message}
        </span>
      )}
    </span>
  );
}
