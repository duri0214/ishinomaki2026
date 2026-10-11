"use client";

import { useEffect, useId, useRef } from "react";
import { GroupImage } from "@/features/layout/GroupImage";
import { useArtistProfile } from "./useArtistProfile";

export function ArtistDialog({
  slug,
  name,
  onDismiss,
}: {
  slug: string;
  name: string;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const query = useArtistProfile(slug);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // ネイティブのモーダルで背景を操作不可にし、フォーカスを内部に保つ。
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const displayName = query.data?.name ?? name;
  const description = query.data?.description?.trim();
  const close = () => {
    // 背景が操作可能になってから、入口のボタンへフォーカスを戻す。
    dialogRef.current?.close();
    onDismiss();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex="0"]',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-[28px] border border-[#e3d9ec] bg-[#fffcf8] p-0 text-[#443354] shadow-2xl backdrop:bg-[#23172f]/50 backdrop:backdrop-blur-sm max-[550px]:h-dvh max-[550px]:max-h-dvh max-[550px]:w-full max-[550px]:max-w-none max-[550px]:rounded-none max-[550px]:border-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eee6f3] bg-[#fffcf8] px-5 py-3">
        <h2 id={titleId} className="text-sm font-bold tracking-wide">
          アーティスト詳細
        </h2>
        <button
          type="button"
          aria-label="アーティスト詳細を閉じる"
          onClick={close}
          className="flex size-11 items-center justify-center rounded-full bg-[#f3ecf7] text-xl hover:bg-[#e9ddf1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72519b]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-[#efe6f4]">
        <GroupImage
          src={`/photos/${slug}.jpg`}
          alt={`${displayName}の集合写真`}
          sizes="(max-width: 550px) 100vw, 36rem"
        />
      </div>
      <div className="space-y-6 px-6 pb-10 pt-7 md:px-8">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-[#8a7d9d]">
            プロフィール
          </p>
          <h3 className="break-words font-serif text-2xl font-bold leading-relaxed">
            {displayName}
          </h3>
        </div>
        {query.isPending ? (
          <p role="status" className="text-sm text-[#8a7d9d]">
            プロフィールを読み込み中…
          </p>
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#e3d9ec] bg-[#f6f0fa] p-5 text-sm leading-7"
          >
            <p>アーティスト情報を読み込めませんでした。</p>
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
              className="mt-3 rounded-full bg-white px-4 py-2 font-medium text-[#72519b] hover:bg-[#ede3f4] disabled:opacity-50"
            >
              {query.isFetching ? "読み込み中…" : "もう一度試す"}
            </button>
          </div>
        ) : description ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-8 text-[#6a5c7d]">
            {description}
          </p>
        ) : (
          <p className="rounded-2xl bg-[#f3ecf7] p-5 text-sm leading-7 text-[#8a7d9d]">
            プロフィールはまだ登録されていません。
          </p>
        )}
      </div>
    </dialog>
  );
}
