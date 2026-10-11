"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { codePointLength } from "@/features/tags/normalize";
import { activeHashtagAt } from "@/features/tags/parse";
import { useTagSuggestions } from "@/features/tags/useTagSuggestions";
import { MAX_POST_LENGTH } from "@/lib/validation";
import { createPostAction } from "./actions";

/** 投稿フォーム（島ビューにだけ表示する）。`#` を打つと島内のタグを候補に出す */
export function Composer({
  islandSlug,
  initialText = "",
}: {
  islandSlug: string;
  /** タグページで開いたときは ` #タグ名` を入力済みにする */
  initialText?: string;
}) {
  const viewer = useViewer();
  const openAuth = useAuthDialog();
  const queryClient = useQueryClient();
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
      <div className="mx-4 mb-2 rounded-2xl bg-[#f6f0fa] px-4 py-2.5 text-sm text-[#6a5c7d]">
        <button
          type="button"
          onClick={() =>
            openAuth({ reason: "投稿するにはアカウントが必要です" })
          }
          className="font-bold text-[#8e6bb0] underline"
        >
          ログイン・新規登録
        </button>
        すると投稿やいいねができます
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
    if (pending || overLimit || text.trim() === "") return;
    setPending(true);
    setError(null);
    try {
      const result = await createPostAction({ islandSlug, body: text });
      if (result.ok) {
        setText(initialText);
        setCaret(0);
        await queryClient.invalidateQueries({ queryKey: ["timeline"] });
      } else {
        setError(result.message);
        // セッションが切れていたら、ログインへ誘導する（本文は残す）
        if (result.code === "unauthorized") {
          openAuth({ mode: "signin", reason: "ログインし直してください" });
        }
      }
    } catch {
      setError("投稿できませんでした。通信状況を確認してください");
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
      className="relative mx-4 mb-2 rounded-[28px] border border-[#ece4ef] bg-white p-3 shadow-[0_10px_28px_-16px_rgba(111,78,142,0.35)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={MAX_POST_LENGTH * 2}
          placeholder="いまどうしてる？ #タグ をつけて投稿しよう"
          aria-label="投稿の本文"
          className="w-full resize-none rounded-2xl bg-[#faf6fb] p-3 text-[15px] leading-6 text-[#4b3d63] outline-none placeholder:text-[#b3a8c4] focus:ring-2 focus:ring-[#c9a5e0]"
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setHighlight(0);
            setDismissed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        {items.length > 0 && (
          <ul
            aria-label="タグの候補"
            className="absolute z-20 mt-1 max-h-48 w-64 overflow-auto rounded-2xl border border-[#ece4ef] bg-white py-1 text-sm shadow-lg"
          >
            {items.map((item, i) => (
              <li key={item.normalizedName}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left ${
                    i === highlight ? "bg-[#f6f0fa]" : ""
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
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span
            className={overLimit ? "font-bold text-rose-600" : "text-[#a79bb8]"}
            aria-live="polite"
          >
            {length}/{MAX_POST_LENGTH}
          </span>
          {error && (
            <span role="alert" className="text-rose-600">
              {error}
            </span>
          )}
          <button
            type="submit"
            disabled={pending || overLimit || text.trim() === ""}
            className="ml-auto rounded-full bg-[#8e6bb0] px-5 py-1.5 text-sm font-bold text-white hover:bg-[#7b5a9d] disabled:bg-[#d9cfe4]"
          >
            {pending ? "投稿中…" : "投稿"}
          </button>
        </div>
      </div>
    </form>
  );
}
