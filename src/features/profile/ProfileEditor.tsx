"use client";

import { useState } from "react";
import { DISPLAY_NAME_MAX } from "@/features/auth/validation";
import { updateProfileAction } from "./actions";

/** 推しの候補（レイアウトで島とメンバーを取得して渡す） */
export type ProfileIslandOption = {
  slug: string;
  name: string;
  members: { id: string; name: string }[];
};

export type ProfileDraft = {
  displayName: string;
  favorites: { islandSlug: string; memberTagIds: string[] }[];
};

/**
 * 表示名と推し（グループ＝島、メンバー）の編集フォーム。
 * 登録直後の2ステップ目と、プロフィールページの編集で使う。
 */
export function ProfileEditor({
  options,
  initial,
  submitLabel = "保存",
  cancelLabel = "キャンセル",
  onSaved,
  onCancel,
}: {
  options: ProfileIslandOption[];
  initial: ProfileDraft;
  submitLabel?: string;
  cancelLabel?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [selected, setSelected] = useState(
    () =>
      new Map(
        initial.favorites.map((f) => [f.islandSlug, new Set(f.memberTagIds)]),
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggleIsland = (slug: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(slug)) next.delete(slug);
      else next.set(slug, new Set());
      return next;
    });
  };

  const toggleMember = (slug: string, id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const members = new Set(next.get(slug));
      if (members.has(id)) members.delete(id);
      else members.add(id);
      next.set(slug, members);
      return next;
    });
  };

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await updateProfileAction({
        displayName,
        favorites: [...selected].map(([islandSlug, members]) => ({
          islandSlug,
          memberTagIds: [...members],
        })),
      });
      if (result.ok) onSaved();
      else setError(result.message);
    } catch {
      setError("保存できませんでした。通信状況を確認してください");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-bold text-[#3f3158]">
        表示名
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX * 2}
          className="rounded-xl border border-[#e2d7ea] bg-[#faf6fb] px-3 py-2 text-[15px] font-normal outline-none focus:ring-2 focus:ring-[#c9a5e0]"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-[#3f3158]">
          推しグループと推しメンバー
        </legend>
        {options.length === 0 && (
          <p className="text-sm text-[#a79bb8]">グループがまだありません</p>
        )}
        {options.map((island) => {
          const members = selected.get(island.slug);
          return (
            <div
              key={island.slug}
              className="rounded-2xl border border-[#ece4ef] bg-white px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm font-bold text-[#3f3158]">
                <input
                  type="checkbox"
                  checked={members !== undefined}
                  onChange={() => toggleIsland(island.slug)}
                  className="size-4 accent-[#8e6bb0]"
                />
                {island.name}
              </label>
              {members && island.members.length > 0 && (
                <fieldset
                  aria-label={`${island.name}の推しメンバー`}
                  className="mt-2 flex flex-wrap gap-1.5"
                >
                  {island.members.map((m) => {
                    const on = members.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleMember(island.slug, m.id)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                          on
                            ? "bg-[#8e6bb0] text-white"
                            : "bg-[#f6f0fa] text-[#6a5c7d] hover:bg-[#ece2f4]"
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </fieldset>
              )}
            </div>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-1.5 text-sm text-[#6a5c7d] hover:bg-[#f6f0fa]"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[#8e6bb0] px-5 py-1.5 text-sm font-bold text-white hover:bg-[#7b5a9d] disabled:bg-[#d9cfe4]"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
