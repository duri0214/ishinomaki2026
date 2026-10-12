"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { setFollowAction } from "./actions";

/** ユーザーのフォロー／フォロー中ボタン。未ログインならログインを促す */
export function FollowButton({
  userId,
  initialFollowing,
}: {
  userId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const openAuth = useAuthDialog();
  const viewer = useViewer();
  const [following, setFollowing] = useState(initialFollowing);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const askToSignIn = () =>
    openAuth({ reason: "フォローするにはアカウントが必要です" });

  const onClick = () => {
    if (!viewer.signedIn) {
      askToSignIn();
      return;
    }
    const next = !following;
    startTransition(async () => {
      const result = await setFollowAction({ userId, following: next });
      if (!result.ok) {
        setMessage(result.message);
        if (result.code === "unauthorized") askToSignIn();
        return;
      }
      setMessage(null);
      setFollowing(result.data.following);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={following}
        className={`rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-60 ${
          following
            ? "bg-[var(--ui-hover)] text-[var(--ui-text)] hover:bg-[var(--ui-border)]"
            : "bg-[var(--ui-accent)] text-[var(--ui-on-accent)] hover:bg-[var(--ui-accent-hover)]"
        }`}
      >
        {following ? "フォロー中" : "フォロー"}
      </button>
      {message && (
        <span role="alert" className="text-xs text-rose-600">
          {message}
        </span>
      )}
    </span>
  );
}
