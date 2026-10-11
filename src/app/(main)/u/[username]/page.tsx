import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/db";
import { LiveRecords } from "@/features/live/LiveRecords";
import { getLiveData } from "@/features/live/service";
import { ProfileView } from "@/features/profile/ProfileView";
import { getProfileByUsername } from "@/features/profile/service";
import { getViewerId } from "@/lib/auth";
import { decodeRouteParam } from "@/lib/route-params";

type Props = { params: Promise<{ username: string }> };

const loadProfile = cache(async (raw: string) =>
  getProfileByUsername(await getDb(), decodeRouteParam(raw)),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const profile = await loadProfile((await params).username);
  if (!profile) return { title: "ユーザーが見つかりません" };
  const title = `${profile.displayName}（@${profile.username}）`;
  return { title, openGraph: { title } };
}

/** プロフィール: 表示名と推し。マップはレイアウトに常駐したまま */
export default async function ProfilePage({ params }: Props) {
  await connection();
  const profile = await loadProfile((await params).username);
  if (!profile) notFound();
  const liveData =
    (await getViewerId()) === profile.id
      ? await getLiveData(await getDb(), profile.id)
      : null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-1">
      <ProfileView profile={profile} />
      {liveData && <LiveRecords data={liveData} />}
    </div>
  );
}
