"use client";

import Link from "next/link";
import { useViewer } from "@/features/auth/viewer";

const unavailableMessage = "ユーザー名に admin を含むアカウントで利用できます";

export function AdminLink() {
  const { user } = useViewer();
  const enabled = user?.username.toLowerCase().includes("admin") ?? false;
  const className =
    "flex size-11 shrink-0 items-center justify-center rounded-2xl text-xs font-bold transition-colors";

  if (!enabled) {
    return (
      <span title={unavailableMessage} className="inline-flex">
        <button
          type="button"
          disabled
          aria-label={`管理画面（${unavailableMessage}）`}
          className={`${className} cursor-not-allowed bg-[var(--ui-rail-button)] text-[var(--ui-rail-text)] opacity-40`}
        >
          管理
        </button>
      </span>
    );
  }

  return (
    <Link
      href="/admin"
      aria-label="管理画面"
      title="管理画面"
      className={`${className} bg-[var(--ui-rail-button)] text-[var(--ui-rail-text)] hover:bg-[var(--ui-rail-hover)]`}
    >
      管理
    </Link>
  );
}
