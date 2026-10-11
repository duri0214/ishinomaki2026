"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
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
      <div className="border-b border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        {viewer.authEnabled ? (
          <>
            <Link href="/sign-in" className="font-bold text-sky-700 underline">
              ログイン
            </Link>
            すると投稿やいいねができます
          </>
        ) : (
          "ログインが設定されていないため、投稿できません（閲覧のみ）"
        )}
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
      className="relative border-b border-slate-200 bg-white px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="mx-auto max-w-2xl">
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={MAX_POST_LENGTH * 2}
          placeholder="いまどうしてる？ #タグ をつけて投稿しよう"
          aria-label="投稿の本文"
          className="w-full resize-none rounded-lg border border-slate-300 p-2 text-[15px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
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
            className="absolute z-20 mt-1 max-h-48 w-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {items.map((item, i) => (
              <li key={item.normalizedName}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left ${
                    i === highlight ? "bg-sky-50" : ""
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
            className={overLimit ? "font-bold text-rose-600" : "text-slate-500"}
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
            className="ml-auto rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
          >
            {pending ? "投稿中…" : "投稿"}
          </button>
        </div>
      </div>
    </form>
  );
}
