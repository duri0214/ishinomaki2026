"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfileOptions } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { FollowButton } from "@/features/follow/FollowButton";
import type { FollowStats } from "@/features/follow/service";
import { MessageButton } from "@/features/messages/MessageButton";
import { ProfileEditor } from "./ProfileEditor";
import type { Profile } from "./service";

/** プロフィール（表示名・推しグループ・推しメンバー）。本人なら編集できる */
export function ProfileView({
  profile,
  follow,
}: {
  profile: Profile;
  follow: FollowStats;
}) {
  const { user } = useViewer();
  const options = useProfileOptions();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const isMe = user?.id === profile.id;

  return (
    <section className="design-card mx-4 mb-4">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="design-avatar flex size-12 shrink-0 items-center justify-center bg-gradient-to-br from-[#c9a5e0] to-[#8f6ab3] font-serif text-xl font-bold text-white"
        >
          {Array.from(profile.displayName)[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-lg font-bold text-[var(--ui-title)]">
            {profile.displayName}
          </h1>
          <p className="truncate text-xs text-[var(--ui-muted)]">
            @{profile.username}
          </p>
        </div>
        {isMe && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-[var(--ui-radius-inner)] bg-[var(--ui-hover)] px-4 py-1.5 text-sm font-bold text-[var(--ui-text)] hover:bg-[var(--ui-border)]"
          >
            編集
          </button>
        )}
        {!isMe && (
          <FollowButton
            userId={profile.id}
            initialFollowing={follow.followedByMe}
          />
        )}
      </header>

      {!isMe && <MessageButton userId={profile.id} />}

      <p className="mt-3 flex gap-4 text-sm text-[var(--ui-muted)]">
        <Link
          href={`/u/${profile.username}/following`}
          className="hover:underline"
        >
          <b className="text-[var(--ui-title)]">{follow.followingCount}</b>{" "}
          フォロー中
        </Link>
        <Link
          href={`/u/${profile.username}/followers`}
          className="hover:underline"
        >
          <b className="text-[var(--ui-title)]">{follow.followerCount}</b>{" "}
          フォロワー
        </Link>
      </p>

      <div className="mt-4">
        {editing ? (
          <ProfileEditor
            options={options}
            initial={{
              displayName: profile.displayName,
              favorites: profile.favorites.map((f) => ({
                islandSlug: f.island.slug,
                memberTagIds: f.members.map((m) => m.id),
              })),
            }}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : profile.favorites.length === 0 ? (
          <p className="text-sm text-[var(--ui-muted)]">
            推しはまだ設定されていません
          </p>
        ) : (
          <ul aria-label="推し" className="flex flex-col gap-3">
            {profile.favorites.map((f) => (
              <li key={f.island.slug}>
                <Link
                  href={`/i/${f.island.slug}`}
                  className="font-serif text-[15px] font-bold text-[var(--ui-title)] hover:text-[var(--ui-accent)] hover:underline"
                >
                  {f.island.name}
                </Link>
                {f.members.length > 0 && (
                  <ul
                    aria-label={`${f.island.name}の推しメンバー`}
                    className="mt-1.5 flex flex-wrap gap-1.5"
                  >
                    {f.members.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/i/${f.island.slug}/t/${encodeURIComponent(m.normalizedName)}`}
                          className="inline-block rounded-[var(--ui-radius-inner)] bg-[var(--ui-hover)] px-3 py-1 text-xs font-bold text-[var(--ui-text)] hover:bg-[var(--ui-border)]"
                        >
                          {m.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
