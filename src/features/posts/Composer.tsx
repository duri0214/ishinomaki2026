"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { repliesQueryKey } from "@/features/replies/useReplies";
import { codePointLength } from "@/features/tags/normalize";
import { activeHashtagAt } from "@/features/tags/parse";
import { useTagSuggestions } from "@/features/tags/useTagSuggestions";
import { patchPostInCaches } from "@/features/timeline/useTimeline";
import { MAX_POST_LENGTH } from "@/lib/validation";
import { createPostAction, createReplyAction } from "./actions";
import { ImagePicker, validateSelection } from "./ImagePicker";

/**
 * 投稿フォーム（島ビューにだけ表示する）。`#` を打つと島内のタグを候補に出す。
 * `replyTo` を渡すと、その投稿への返信フォームになる（投稿カードのスレッドで使う）。
 */
export function Composer({
  islandSlug,
  initialText = "",
  replyTo,
}: {
  islandSlug: string;
  /** タグページで開いたときは ` #タグ名` を入力済みにする */
  initialText?: string;
  /** 返信先の投稿のID */
  replyTo?: string;
}) {
  const viewer = useViewer();
  const openAuth = useAuthDialog();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState(initialText);
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = activeHashtagAt(text, caret);
  const suggestions = useTagSuggestions(
    islandSlug,
    active?.query ?? "",
    Boolean(active) && !dismissed,
  );
  const items = active && !dismissed ? (suggestions.data ?? []) : [];
  const length = codePointLength(text.trim());
  const overLimit = length > MAX_POST_LENGTH;

  if (!viewer.signedIn) {
    return (
      <div
        className={`rounded-[var(--ui-radius-surface)] bg-[var(--ui-hover)] px-4 py-2.5 text-sm text-[var(--ui-text)] ${replyTo ? "" : "mx-4 mb-2"}`}
      >
        <button
          type="button"
          onClick={() =>
            openAuth({
              reason: replyTo
                ? "返信するにはアカウントが必要です"
                : "投稿するにはアカウントが必要です",
            })
          }
          className="font-bold text-[var(--ui-accent)] underline"
        >
          ログイン・新規登録
        </button>
        {replyTo ? "すると返信できます" : "すると投稿やいいねができます"}
      </div>
    );
  }

  const insertTag = (name: string) => {
    if (!active) return;
    const before = text.slice(0, active.start);
    const after = text.slice(caret);
    const inserted = `#${name} `;
    const next = `${before}${inserted}${after.replace(/^ /, "")}`;
    const pos = before.length + inserted.length;
    setText(next);
    setCaret(pos);
    setHighlight(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const submit = async () => {
    if (pending || overLimit || (text.trim() === "" && files.length === 0))
      return;
    setPending(true);
    setError(null);
    try {
      const attachments = new FormData();
      for (const file of files) attachments.append("images", file);
      const result = replyTo
        ? await createReplyAction({
            parentPostId: replyTo,
            body: text,
            ...(files.length ? { attachments } : {}),
          })
        : await createPostAction({
            islandSlug,
            body: text,
            ...(files.length ? { attachments } : {}),
          });
      if (result.ok) {
        setFiles([]);
        setText(initialText);
        setCaret(0);
        if (replyTo) {
          // 返信はタイムラインに流れないので、元の投稿の返信数だけ増やす
          patchPostInCaches(queryClient, replyTo, (p) => ({
            ...p,
            replyCount: p.replyCount + 1,
          }));
          await queryClient.invalidateQueries({
            queryKey: repliesQueryKey(replyTo),
          });
        } else {
          await queryClient.invalidateQueries({ queryKey: ["timeline"] });
        }
      } else {
        setError(result.message);
        // セッションが切れていたら、ログインへ誘導する（本文は残す）
        if (result.code === "unauthorized") {
          openAuth({ mode: "signin", reason: "ログインし直してください" });
        }
      }
    } catch {
      setError(
        `${replyTo ? "返信" : "投稿"}できませんでした。通信状況を確認してください`,
      );
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語入力の変換確定中のキーは扱わない
    if (e.nativeEvent.isComposing) return;
    if (items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = items[highlight] ?? items[0];
        if (item) insertTag(item.name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className={`design-composer relative ${replyTo ? "" : "mx-4 mb-2"}`}
      onDragOver={(e) => {
        if (!pending && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        if (pending) return;
        const next = [...files, ...Array.from(e.dataTransfer.files)];
        const problem = validateSelection(next);
        setError(problem);
        if (!problem) setFiles(next);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[var(--ui-radius-surface)] bg-black/55 p-4"
          data-testid="image-drop-overlay"
        >
          <div
            role="status"
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--ui-accent)] bg-white/95 px-4 py-5 text-center text-[var(--ui-accent)] shadow-xl"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 120 92"
              className="h-20 w-28"
              fill="none"
            >
              <rect
                x="20"
                y="17"
                width="66"
                height="62"
                rx="10"
                fill="currentColor"
                opacity=".12"
                transform="rotate(-12 53 48)"
              />
              <rect
                x="35"
                y="12"
                width="66"
                height="62"
                rx="10"
                fill="currentColor"
                opacity=".12"
                transform="rotate(12 68 43)"
              />
              <rect
                x="29"
                y="8"
                width="62"
                height="76"
                rx="10"
                fill="white"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
              <circle cx="60" cy="46" r="19" fill="currentColor" opacity=".1" />
              <path
                d="M60 35v22M49 46h22"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-base font-bold">ここに画像をドロップ</p>
            <p className="text-xs">最大4枚・合計4MB</p>
          </div>
        </div>
      )}
      <div>
        <textarea
          disabled={pending}
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={MAX_POST_LENGTH * 2}
          placeholder={
            replyTo ? "返信を書く" : "いまどうしてる？ #タグ をつけて投稿しよう"
          }
          aria-label={replyTo ? "返信の本文" : "投稿の本文"}
          className="design-field w-full resize-none p-3 text-[15px] leading-6 outline-none"
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setHighlight(0);
            setDismissed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        <div
          className="mt-1 text-right text-xs"
          data-testid="post-text-counter"
        >
          <span
            className={
              overLimit ? "font-bold text-rose-600" : "text-[var(--ui-muted)]"
            }
            aria-live="polite"
          >
            {length}/{MAX_POST_LENGTH}
          </span>
        </div>
        {items.length > 0 && (
          <ul
            aria-label="タグの候補"
            className="design-suggestions absolute z-20 mt-1 max-h-48 w-64 max-w-[calc(100%_-_1.5rem)] overflow-auto text-sm shadow-lg"
          >
            {items.map((item, i) => (
              <li key={item.normalizedName}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left ${
                    i === highlight ? "bg-[var(--ui-hover)]" : ""
                  }`}
                  // クリックでテキストエリアのフォーカスが外れないようにする
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertTag(item.name)}
                >
                  <span>#{item.name}</span>
                  {item.kind === "member" && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                      メンバー
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <ImagePicker
          files={files}
          disabled={pending}
          onChange={(next) => {
            const problem = validateSelection(next);
            setError(problem);
            if (!problem) setFiles(next);
          }}
        />
        <div className="mt-1 flex items-center gap-3 text-xs">
          {error && (
            <span role="alert" className="text-rose-600">
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={
              pending || overLimit || (text.trim() === "" && files.length === 0)
            }
            className="ml-auto rounded-[var(--ui-radius-inner)] bg-[var(--ui-accent)] px-5 py-1.5 text-sm font-bold text-[var(--ui-on-accent)] hover:bg-[var(--ui-accent-hover)] disabled:bg-[var(--ui-disabled)]"
          >
            {replyTo
              ? pending
                ? "返信中…"
                : "返信"
              : pending
                ? "投稿中…"
                : "投稿"}
          </button>
        </div>
      </div>
    </form>
  );
}
