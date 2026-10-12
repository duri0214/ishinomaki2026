"use client";

import Link from "next/link";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { useMessageNotifications } from "./MessageNotifications";

export function MessagesLink() {
  const { user } = useViewer();
  const openAuth = useAuthDialog();
  const { unreadCount } = useMessageNotifications();
  const className =
    "relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-rail-button)] text-[var(--ui-rail-text)] hover:bg-[var(--ui-rail-hover)] lg:size-11";
  const icon = (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
  return user ? (
    <Link
      href="/messages"
      prefetch={false}
      aria-label="メッセージ一覧"
      title="メッセージ"
      className={className}
    >
      {icon}
      {unreadCount > 0 && (
        <span
          data-testid="messages-unread-badge"
          className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--ui-rail)]"
        >
          <span aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
          <span className="sr-only">
            未読のメッセージが{unreadCount}件あります
          </span>
        </span>
      )}
    </Link>
  ) : (
    <button
      type="button"
      aria-label="メッセージ一覧"
      title="メッセージ"
      className={className}
      onClick={() => openAuth({ reason: "DMを使うにはアカウントが必要です" })}
    >
      {icon}
    </button>
  );
}
