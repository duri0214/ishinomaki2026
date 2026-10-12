"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { FollowButton } from "@/features/follow/FollowButton";
import { avatarClass } from "@/features/timeline/avatar";
import { CommonBadge } from "./CommonBadge";
import {
  RELATED_USERS_MAX,
  RELATED_USERS_PAGE_SIZE,
  RELATED_USERS_SIGN_IN_REASON,
} from "./constants";
import type { RelatedUser } from "./rank";
import { SignInRequiredError, useRelatedUsers } from "./useRelatedUsers";

/** 共通点のあるユーザーの一覧。横並びのレイアウトでは、この領域だけがスクロールする */
export function RelatedUsers({ active }: { active: boolean }) {
  const { signedIn, user } = useViewer();
  const openAuth = useAuthDialog();
  const query = useRelatedUsers(user?.id ?? null, active);
  const [visible, setVisible] = useState(RELATED_USERS_PAGE_SIZE);

  const users = query.data?.users ?? [];
  const needsSignIn = !signedIn || query.error instanceof SignInRequiredError;
  const showSkeleton = !needsSignIn && query.isPending;
  const showError = !needsSignIn && query.isError && users.length === 0;

  return (
    <div
      className="flex-1 px-4 pb-8 wide:min-h-0 wide:overflow-y-auto"
      data-testid="related-users"
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--ui-muted)]">
          <span>推しメンバー › ライブ › 推しグループの順</span>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={needsSignIn || query.isFetching}
            className="shrink-0 rounded px-2 py-1 hover:bg-[var(--ui-hover)] disabled:opacity-50"
          >
            {query.isFetching ? "更新中…" : "↻ 更新"}
          </button>
        </div>

        {needsSignIn && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm leading-7 text-[var(--ui-text)]">
            <p>{RELATED_USERS_SIGN_IN_REASON}</p>
            <button
              type="button"
              onClick={() => openAuth({ reason: RELATED_USERS_SIGN_IN_REASON })}
              className="rounded-full bg-[var(--ui-accent)] px-4 py-1.5 text-sm font-bold text-[var(--ui-on-accent)] hover:bg-[var(--ui-accent-hover)]"
            >
              ログイン・新規登録
            </button>
          </div>
        )}

        {showSkeleton && (
          <div
            role="status"
            aria-label="読み込み中"
            className="flex flex-col gap-3"
          >
            {["a", "b", "c"].map((k) => (
              <div
                key={k}
                className="h-24 animate-pulse rounded-[var(--ui-radius)] bg-[var(--ui-hover)]"
              />
            ))}
          </div>
        )}

        {showError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            共通点のあるユーザーを読み込めませんでした。
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => query.refetch()}
            >
              もう一度試す
            </button>
          </div>
        )}

        {query.isSuccess && users.length === 0 && (
          <p className="py-10 text-center text-sm leading-7 text-[var(--ui-text)]">
            {query.data.hasCriteria ? (
              <>
                共通点のあるユーザーはまだ見つかりませんでした。
                <br />
                フォロー済みのユーザーは表示されません。
              </>
            ) : (
              <>
                推しグループやライブの参戦記録を登録すると、
                <br />
                共通点のあるユーザーが見つかります。
                {user && (
                  <>
                    <br />
                    <Link
                      href={`/u/${user.username}`}
                      className="font-bold text-[var(--ui-accent)] underline"
                    >
                      プロフィールで推しを設定する
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        )}

        {users.length > 0 && (
          <ul aria-label="共通点のあるユーザー" className="flex flex-col gap-4">
            {users.slice(0, visible).map((related) => (
              <RelatedUserCard key={related.id} related={related} />
            ))}
          </ul>
        )}

        {users.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((n) => n + RELATED_USERS_PAGE_SIZE)}
            className="mx-auto rounded-full border border-[var(--ui-border)] bg-[var(--ui-card)] px-4 py-1 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-hover)]"
          >
            もっと見る
          </button>
        )}
        {users.length >= RELATED_USERS_MAX && users.length <= visible && (
          <p className="text-center text-xs text-[var(--ui-muted)]">
            共通点の多い上位{RELATED_USERS_MAX}人まで表示しています
          </p>
        )}
        {query.isError && users.length > 0 && (
          <p role="alert" className="text-center text-xs text-rose-600">
            更新できませんでした
          </p>
        )}
      </div>
    </div>
  );
}

function RelatedUserCard({ related }: { related: RelatedUser }) {
  return (
    <li className="design-card" data-testid="related-user">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`design-avatar flex size-9 shrink-0 items-center justify-center bg-gradient-to-br font-serif text-base font-bold text-white ${avatarClass(related.displayName)}`}
        >
          {Array.from(related.displayName)[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-[var(--ui-title)]">
            <Link
              href={`/u/${related.username}`}
              className="hover:text-[var(--ui-accent)] hover:underline"
            >
              {related.displayName}
            </Link>
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--ui-muted)]">
            @{related.username}
          </p>
        </div>
        <FollowButton userId={related.id} initialFollowing={false} />
      </div>
      <ul aria-label="共通点" className="mt-2.5 flex flex-wrap gap-1.5">
        {related.commons.map((point) => (
          <li key={`${point.kind}:${point.id}`} className="max-w-full">
            <CommonBadge point={point} />
          </li>
        ))}
        {related.moreCount > 0 && (
          <li>
            <span className="inline-block rounded-[var(--ui-radius-inner)] border border-transparent px-2 py-0.5 text-[11px] font-bold leading-snug text-[var(--ui-muted)]">
              他{related.moreCount}件
            </span>
          </li>
        )}
      </ul>
    </li>
  );
}
