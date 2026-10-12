import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { FollowList } from "@/features/follow/FollowList";
import { listFollows } from "@/features/follow/service";
import { getProfileByUsername } from "@/features/profile/service";
import { decodeRouteParam } from "@/lib/route-params";

type Props = { params: Promise<{ username: string }> };

export const metadata: Metadata = { title: "フォロワー" };

/** フォロワー一覧 */
export default async function FollowersPage({ params }: Props) {
  await connection();
  const db = await getDb();
  const profile = await getProfileByUsername(
    db,
    decodeRouteParam((await params).username),
  );
  if (!profile) notFound();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-1">
      <FollowList
        owner={profile}
        kind="followers"
        users={await listFollows(db, profile.id, "followers")}
      />
    </div>
  );
}
