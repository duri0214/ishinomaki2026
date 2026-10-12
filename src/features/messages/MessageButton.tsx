"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { startConversationAction } from "./actions";

export function MessageButton({ userId }: { userId: string }) {
  const { user } = useViewer();
  const openAuth = useAuthDialog();
  const router = useRouter();
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (user?.id === userId) return null;

  const start = async () => {
    if (!user) {
      openAuth({ reason: "DMを送るにはアカウントが必要です" });
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await startConversationAction(userId);
      if (result.ok) router.push(`/messages/${result.data.id}`);
      else {
        setError(result.message);
        if (result.code === "unauthorized")
          openAuth({ mode: "signin", reason: "ログインし直してください" });
      }
    } catch {
      setError("会話を開けませんでした。通信状況を確認してください");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={start}
        className="rounded-full border border-[var(--ui-border)] px-4 py-1.5 text-sm font-bold text-[var(--ui-accent)] hover:bg-[var(--ui-hover)] disabled:opacity-50"
      >
        {pending ? "会話を開いています…" : "メッセージ"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-[var(--ui-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
