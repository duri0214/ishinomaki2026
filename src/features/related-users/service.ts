import { and, eq, isNull, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/connect";
import {
  islands,
  liveEvents,
  liveRecords,
  tags,
  userFavoriteIslands,
  userFavoriteMembers,
  userFollows,
  users,
} from "@/db/schema";
import { type CommonRow, type RelatedUser, rankRelatedUsers } from "./rank";

export type RelatedUsersResult = {
  users: RelatedUser[];
  /** 閲覧者が推しグループか参戦記録を1つでも持っているか。空のときの案内を出し分ける */
  hasCriteria: boolean;
};

/**
 * 閲覧者と共通点のあるユーザーを、優先順位（推しメンバー > ライブ > 推しグループ）の順に返す。
 *
 * 共通点ごとに「閲覧者の行」と「同じ対象を持つ他人の行」を自己結合して取り出し、並べ替えは rankRelatedUsers で行う。
 * 他人の推し・参戦記録は、閲覧者と共通する対象の名前だけを取り出す（参戦記録のメモは読まない）。
 * 自分・退会済み・フォロー済みのユーザーは除く。想定規模（数十〜数百人）では、メモリ上の並べ替えで足りる。
 */
export async function getRelatedUsers(
  db: Db,
  viewerId: string,
): Promise<RelatedUsersResult> {
  // 候補になれるユーザー: 自分以外・退会していない・まだフォローしていない
  const candidate = and(
    ne(users.id, viewerId),
    isNull(users.deletedAt),
    notExists(
      db
        .select({ one: sql`1` })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, viewerId),
            eq(userFollows.followeeId, users.id),
          ),
        ),
    ),
  );

  const myMembers = alias(userFavoriteMembers, "my_members");
  const myRecords = alias(liveRecords, "my_records");
  const myIslands = alias(userFavoriteIslands, "my_islands");

  const [members, lives, groups] = await Promise.all([
    db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        id: tags.id,
        label: tags.name,
        islandId: islands.id,
        islandName: islands.name,
      })
      .from(userFavoriteMembers)
      .innerJoin(
        myMembers,
        and(
          eq(myMembers.tagId, userFavoriteMembers.tagId),
          eq(myMembers.userId, viewerId),
        ),
      )
      // 島エディタでメンバーから外されたタグは、推しメンバーとして扱わない
      .innerJoin(
        tags,
        and(eq(tags.id, userFavoriteMembers.tagId), eq(tags.kind, "member")),
      )
      .innerJoin(islands, eq(islands.id, tags.islandId))
      .innerJoin(users, eq(users.id, userFavoriteMembers.userId))
      .where(candidate),
    db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        id: liveEvents.id,
        label: liveEvents.title,
        islandId: islands.id,
        islandName: islands.name,
      })
      .from(liveRecords)
      .innerJoin(
        myRecords,
        and(
          eq(myRecords.eventId, liveRecords.eventId),
          eq(myRecords.userId, viewerId),
        ),
      )
      .innerJoin(liveEvents, eq(liveEvents.id, liveRecords.eventId))
      .innerJoin(islands, eq(islands.id, liveEvents.islandId))
      .innerJoin(users, eq(users.id, liveRecords.userId))
      .where(candidate),
    db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        id: islands.id,
        label: islands.name,
        islandId: islands.id,
        islandName: islands.name,
      })
      .from(userFavoriteIslands)
      .innerJoin(
        myIslands,
        and(
          eq(myIslands.islandId, userFavoriteIslands.islandId),
          eq(myIslands.userId, viewerId),
        ),
      )
      .innerJoin(islands, eq(islands.id, userFavoriteIslands.islandId))
      .innerJoin(users, eq(users.id, userFavoriteIslands.userId))
      .where(candidate),
  ]);

  const rows: CommonRow[] = [
    ...members.map((r) => ({ ...r, kind: "member" as const })),
    ...lives.map((r) => ({ ...r, kind: "live" as const })),
    ...groups.map((r) => ({ ...r, kind: "island" as const })),
  ];
  const related = rankRelatedUsers(rows);
  if (related.length > 0) return { users: related, hasCriteria: true };

  // 誰も見つからなかったとき: 推しも参戦記録もないのか、共通する人がいないだけなのかを区別する
  const [island, record] = await Promise.all([
    db
      .select({ one: sql`1` })
      .from(userFavoriteIslands)
      .where(eq(userFavoriteIslands.userId, viewerId))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(liveRecords)
      .where(eq(liveRecords.userId, viewerId))
      .limit(1),
  ]);
  return { users: [], hasCriteria: island.length > 0 || record.length > 0 };
}
