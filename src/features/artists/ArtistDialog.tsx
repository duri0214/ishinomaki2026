"use client";

import { useEffect, useId, useRef } from "react";
import { GroupImage } from "@/features/layout/GroupImage";
import { groupPhoto } from "@/features/layout/photos";
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
      className="design-dialog design-artist-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl p-0 shadow-2xl backdrop:bg-[#23172f]/50 backdrop:backdrop-blur-sm max-[550px]:h-dvh max-[550px]:max-h-dvh max-[550px]:w-full max-[550px]:max-w-none"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-panel)] px-5 py-3">
        <h2
          id={titleId}
          className="text-sm font-bold tracking-wide text-[var(--ui-title)]"
        >
          アーティスト詳細
        </h2>
        <button
          type="button"
          aria-label="アーティスト詳細を閉じる"
          onClick={close}
          className="flex size-11 items-center justify-center rounded-full bg-[var(--ui-hover)] text-xl hover:bg-[var(--ui-border)]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="design-artist-photo relative aspect-[2/1] overflow-hidden bg-[var(--ui-hover)]">
        <GroupImage
          src={groupPhoto({ name, slug })}
          alt={`${displayName}の集合写真`}
          sizes="(max-width: 550px) calc(100vw - 40px), 34rem"
        />
      </div>
      <div className="design-dialog-content space-y-6">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-[var(--ui-muted)]">
            プロフィール
          </p>
          <h3 className="break-words font-serif text-2xl font-bold leading-relaxed text-[var(--ui-title)]">
            {displayName}
          </h3>
        </div>
        {query.isPending ? (
          <p role="status" className="text-sm text-[var(--ui-muted)]">
            プロフィールを読み込み中…
          </p>
        ) : query.isError ? (
          <div
            role="alert"
            className="design-notice border border-[var(--ui-border)] bg-[var(--ui-hover)] p-5 text-sm leading-7"
          >
            <p>アーティスト情報を読み込めませんでした。</p>
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
              className="mt-3 rounded-[var(--ui-radius-inner)] bg-[var(--ui-card)] px-4 py-2 font-medium text-[var(--ui-accent)] hover:bg-[var(--ui-border)] disabled:opacity-50"
            >
              {query.isFetching ? "読み込み中…" : "もう一度試す"}
            </button>
          </div>
        ) : description ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-8">
            {description}
          </p>
        ) : (
          <p className="design-notice bg-[var(--ui-hover)] p-5 text-sm leading-7 text-[var(--ui-muted)]">
            プロフィールはまだ登録されていません。
          </p>
        )}
      </div>
    </dialog>
  );
}
