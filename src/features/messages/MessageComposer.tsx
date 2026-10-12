"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { codePointLength } from "@/features/tags/normalize";
import { MAX_POST_LENGTH } from "@/lib/validation";
import { sendMessageAction } from "./actions";
import { MESSAGES_KEY } from "./useMessages";

export function MessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const client = useQueryClient();
  const openAuth = useAuthDialog();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const length = codePointLength(body.replace(/\r\n?/g, "\n").trim());
  const invalid = length === 0 || length > MAX_POST_LENGTH;

  const submit = async () => {
    if (sending.current || invalid) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await sendMessageAction({ conversationId, body });
      if (result.ok) {
        setBody("");
        await client.invalidateQueries({ queryKey: [MESSAGES_KEY] });
      } else {
        setError(result.message);
        if (result.code === "unauthorized")
          openAuth({ mode: "signin", reason: "ログインし直してください" });
      }
    } catch {
      setError("送信できませんでした。通信状況を確認してください");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <form
      className="design-composer mx-4 mb-3 shrink-0"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label="メッセージの本文"
        placeholder="メッセージを書く"
        rows={2}
        value={body}
        disabled={pending}
        maxLength={MAX_POST_LENGTH * 2}
        className="design-field w-full resize-none p-3 text-sm outline-none"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (
            !e.nativeEvent.isComposing &&
            e.key === "Enter" &&
            (e.ctrlKey || e.metaKey)
          ) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span
          aria-live="polite"
          className={
            length > MAX_POST_LENGTH
              ? "text-[var(--ui-danger)]"
              : "text-[var(--ui-muted)]"
          }
        >
          {length}/{MAX_POST_LENGTH}
        </span>
        <button
          type="submit"
          disabled={pending || invalid}
          className="rounded-[var(--ui-radius-inner)] bg-[var(--ui-accent)] px-4 py-1.5 text-sm font-bold text-[var(--ui-on-accent)] hover:bg-[var(--ui-accent-hover)] disabled:bg-[var(--ui-disabled)]"
        >
          {pending ? "送信中…" : "送信"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--ui-danger)]">
          {error}
        </p>
      )}
    </form>
  );
}
