"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RELATED_USERS_KEY } from "@/features/related-users/constants";
import { useAuthDialog } from "./AuthDialog";
import { signOutAction } from "./actions";
import { useViewer } from "./viewer";

/** ツールバー末尾（PCでは左下）のアカウントボタン。未ログインなら登録・ログインのモーダルを開く */
export function AccountButton() {
  const { user } = useViewer();
  const openAuth = useAuthDialog();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // メニューの外をクリックしたら閉じる
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openAuth({ mode: "signup" })}
        className="rounded-full bg-[#fffcf8] px-2.5 py-1 text-[11px] font-bold text-[#3f3158] hover:bg-white wide:lg:px-2"
      >
        ログイン
      </button>
    );
  }

  const signOut = async () => {
    setMenuOpen(false);
    const result = await signOutAction();
    if (!result.ok) return;
    // 私的なDMだけを中断・破棄し、公開タイムラインは再取得して維持する。
    await queryClient.cancelQueries({ queryKey: ["messages"] });
    queryClient.removeQueries({ queryKey: ["messages"] });
    router.refresh();
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    // 前のユーザーの関連ユーザーを、画面にもキャッシュにも残さない
    queryClient.removeQueries({ queryKey: [RELATED_USERS_KEY] });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="アカウントメニュー"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={`${user.displayName}（@${user.username}）`}
        onClick={() => setMenuOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-[#c9a5e0] to-[#8f6ab3] font-serif text-lg font-bold text-white hover:brightness-110"
      >
        {Array.from(user.displayName)[0]}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="design-menu absolute right-0 top-full z-30 mt-2 w-44 text-sm shadow-lg wide:lg:bottom-0 wide:lg:left-full wide:lg:right-auto wide:lg:top-auto wide:lg:ml-2 wide:lg:mt-0"
        >
          <p className="truncate px-3 py-1.5 text-xs text-[var(--ui-muted)]">
            @{user.username}
          </p>
          <Link
            role="menuitem"
            href={`/u/${user.username}`}
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-2 hover:bg-[var(--ui-hover)]"
          >
            プロフィール
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            className="block w-full px-3 py-2 text-left hover:bg-[var(--ui-hover)]"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
