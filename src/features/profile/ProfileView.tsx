"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfileOptions } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { ProfileEditor } from "./ProfileEditor";
import type { Profile } from "./service";

/** プロフィール（表示名・推しグループ・推しメンバー）。本人なら編集できる */
export function ProfileView({ profile }: { profile: Profile }) {
  const { user } = useViewer();
  const options = useProfileOptions();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const isMe = user?.id === profile.id;

  return (
    <section className="mx-4 mb-4 rounded-[28px] border border-[#ece4ef] bg-white p-4 shadow-[0_10px_28px_-16px_rgba(111,78,142,0.35)]">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a5e0] to-[#8f6ab3] font-serif text-xl font-bold text-white"
        >
          {Array.from(profile.displayName)[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-lg font-bold text-[#3f3158]">
            {profile.displayName}
          </h1>
          <p className="truncate text-xs text-[#a79bb8]">@{profile.username}</p>
        </div>
        {isMe && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-[#f6f0fa] px-4 py-1.5 text-sm font-bold text-[#6a5c7d] hover:bg-[#ece2f4]"
          >
            編集
          </button>
        )}
      </header>

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
          <p className="text-sm text-[#a79bb8]">推しはまだ設定されていません</p>
        ) : (
          <ul aria-label="推し" className="flex flex-col gap-3">
            {profile.favorites.map((f) => (
              <li key={f.island.slug}>
                <Link
                  href={`/i/${f.island.slug}`}
                  className="font-serif text-[15px] font-bold text-[#3f3158] hover:text-[#8e6bb0] hover:underline"
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
                          className="inline-block rounded-full bg-[#f6f0fa] px-3 py-1 text-xs font-bold text-[#6a5c7d] hover:bg-[#ece2f4]"
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
