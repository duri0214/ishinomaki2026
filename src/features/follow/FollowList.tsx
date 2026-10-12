import Link from "next/link";
import type { FollowListKind, FollowListUser } from "./service";

const TITLES: Record<FollowListKind, string> = {
  following: "フォロー中",
  followers: "フォロワー",
};

/** フォロー中／フォロワーの一覧。プロフィールへのリンクを並べる */
export function FollowList({
  owner,
  kind,
  users,
}: {
  owner: { username: string; displayName: string };
  kind: FollowListKind;
  users: FollowListUser[];
}) {
  return (
    <section className="design-post mx-4 mb-4 border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 shadow-[0_10px_28px_-16px_var(--ui-shadow)]">
      <Link
        href={`/u/${owner.username}`}
        className="text-xs text-[var(--ui-muted)] hover:underline"
      >
        ← {owner.displayName}（@{owner.username}）
      </Link>
      <h1 className="mt-1 font-serif text-lg font-bold text-[var(--ui-title)]">
        {TITLES[kind]}
      </h1>
      {users.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ui-muted)]">
          {kind === "following"
            ? "まだ誰もフォローしていません"
            : "まだフォロワーはいません"}
        </p>
      ) : (
        <ul aria-label={TITLES[kind]} className="mt-3 flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/u/${u.username}`}
                className="flex items-baseline gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--ui-hover)]"
              >
                <span className="font-bold text-[var(--ui-title)]">
                  {u.displayName}
                </span>
                <span className="text-xs text-[var(--ui-muted)]">
                  @{u.username}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
