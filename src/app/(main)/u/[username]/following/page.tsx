import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { FollowList } from "@/features/follow/FollowList";
import { listFollows } from "@/features/follow/service";
import { getProfileByUsername } from "@/features/profile/service";
import { decodeRouteParam } from "@/lib/route-params";

type Props = { params: Promise<{ username: string }> };

export const metadata: Metadata = { title: "フォロー中" };

/** フォロー中のユーザー一覧 */
export default async function FollowingPage({ params }: Props) {
  await connection();
  const db = await getDb();
  const profile = await getProfileByUsername(
    db,
    decodeRouteParam((await params).username),
  );
  if (!profile) notFound();
  return (
    <div className="flex-1 pt-1 wide:min-h-0 wide:overflow-y-auto">
      <FollowList
        owner={profile}
        kind="following"
        users={await listFollows(db, profile.id, "following")}
      />
    </div>
  );
}
