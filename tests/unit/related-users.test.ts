import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import {
  liveEvents,
  liveRecords,
  tags,
  userFavoriteIslands,
  userFavoriteMembers,
  users,
} from "@/db/schema";
import { setFollow } from "@/features/follow/service";
import {
  RELATED_BADGE_LIMIT,
  RELATED_USERS_MAX,
} from "@/features/related-users/constants";
import {
  type CommonRow,
  rankRelatedUsers,
} from "@/features/related-users/rank";
import { getRelatedUsers } from "@/features/related-users/service";
import { createTestDb } from "../helpers/db";
import { insertIsland, insertTag, insertUser } from "../helpers/fixtures";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

/** 島ごとに独立したデータを作る（他のテストと推しが重ならないように、毎回新しい島を使う） */
async function setup() {
  const a = await insertIsland(conn.db);
  const b = await insertIsland(conn.db);
  const a1 = await insertTag(conn.db, a.id, "みさき", "member");
  const a2 = await insertTag(conn.db, a.id, "ひなた", "member");
  const b1 = await insertTag(conn.db, b.id, "あおい", "member");
  const [eventA] = await conn.db
    .insert(liveEvents)
    .values({
      islandId: a.id,
      title: "春公演",
      venue: "会場A",
      startsAt: new Date("2026-04-01T00:00:00Z"),
    })
    .returning();
  const [eventB] = await conn.db
    .insert(liveEvents)
    .values({
      islandId: b.id,
      title: "春公演",
      venue: "会場B",
      startsAt: new Date("2026-04-02T00:00:00Z"),
    })
    .returning();
  return { a, b, a1, a2, b1, eventA: must(eventA), eventB: must(eventB) };
}

/** 推しグループと推しメンバー（グループが先でないと、メンバーの複合外部キーに違反する） */
async function favorite(
  userId: string,
  islandId: string,
  memberTagIds: string[] = [],
) {
  await conn.db
    .insert(userFavoriteIslands)
    .values({ userId, islandId })
    .onConflictDoNothing();
  for (const tagId of memberTagIds) {
    await conn.db
      .insert(userFavoriteMembers)
      .values({ userId, islandId, tagId });
  }
}

async function attend(userId: string, eventId: string, note = "") {
  await conn.db.insert(liveRecords).values({ userId, eventId, note });
}

const idsOf = (result: Awaited<ReturnType<typeof getRelatedUsers>>) =>
  result.users.map((u) => u.id);

describe("getRelatedUsers: 共通点", () => {
  it("推しメンバーが共通するユーザーを、メンバー名のバッジ付きで返す", async () => {
    const { a, a1, a2 } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db, "ファン");
    await favorite(me.id, a.id, [a1.id]);
    await favorite(fan.id, a.id, [a1.id, a2.id]);

    const result = await getRelatedUsers(conn.db, me.id);
    expect(result.hasCriteria).toBe(true);
    expect(result.users).toEqual([
      {
        id: fan.id,
        username: fan.username,
        displayName: "ファン",
        // 共通するのは みさき だけ（ひなた は自分の推しではない）。同じ島の推しグループは別バッジにしない
        commons: [
          { kind: "member", id: a1.id, label: "みさき", islandName: a.name },
        ],
        moreCount: 0,
      },
    ]);
  });

  it("同じ公演に参戦したユーザーを、公演名とグループ名つきで返す。メモは返さない", async () => {
    const { eventA } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    await attend(me.id, eventA.id, "自分のメモ");
    await attend(fan.id, eventA.id, "相手の秘密のメモ");

    const result = await getRelatedUsers(conn.db, me.id);
    expect(idsOf(result)).toEqual([fan.id]);
    expect(result.users[0]?.commons).toHaveLength(1);
    expect(result.users[0]?.commons[0]).toMatchObject({
      kind: "live",
      id: eventA.id,
      label: "春公演",
    });
    expect(JSON.stringify(result)).not.toContain("相手の秘密のメモ");
    expect(JSON.stringify(result)).not.toContain("自分のメモ");
  });

  it("同じ推しグループだけが共通するユーザーを返す", async () => {
    const { a, b } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    const other = await insertUser(conn.db);
    await favorite(me.id, a.id);
    await favorite(fan.id, a.id);
    await favorite(other.id, b.id);

    const result = await getRelatedUsers(conn.db, me.id);
    expect(idsOf(result)).toEqual([fan.id]);
    expect(result.users[0]?.commons).toEqual([
      { kind: "island", id: a.id, label: a.name, islandName: a.name },
    ]);
  });

  it("名前が同じ公演でも、公演ID（グループ）で区別する", async () => {
    const { eventA, eventB } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    await attend(me.id, eventA.id);
    await attend(fan.id, eventB.id);
    expect((await getRelatedUsers(conn.db, me.id)).users).toEqual([]);
  });

  it("グループの共通点は、そのグループのメンバーが共通していれば重複させない", async () => {
    const { a, b, a1 } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    await favorite(me.id, b.id);
    await favorite(fan.id, a.id, [a1.id]);
    await favorite(fan.id, b.id);

    const [related] = (await getRelatedUsers(conn.db, me.id)).users;
    // a のグループは みさき に含まれる。b のグループだけが別のバッジになる
    expect(related?.commons.map((c) => `${c.kind}:${c.label}`)).toEqual([
      "member:みさき",
      `island:${b.name}`,
    ]);
    expect(related?.moreCount).toBe(0);
  });

  it("バッジは優先順位の順に最大3件までで、残りは件数にまとめる", async () => {
    const { a, b, a1, a2, b1, eventA, eventB } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    for (const u of [me, fan]) {
      await favorite(u.id, a.id, [a1.id, a2.id]);
      await favorite(u.id, b.id, [b1.id]);
      await attend(u.id, eventA.id);
      await attend(u.id, eventB.id);
    }

    const [related] = (await getRelatedUsers(conn.db, me.id)).users;
    // メンバー3 + ライブ2（グループはすべてメンバーに含まれる）= 5件
    expect(related?.commons).toHaveLength(RELATED_BADGE_LIMIT);
    expect(related?.commons.map((c) => c.kind)).toEqual([
      "member",
      "member",
      "member",
    ]);
    expect(related?.moreCount).toBe(2);
  });
});

describe("getRelatedUsers: 除外と閲覧者", () => {
  it("自分・退会済み・フォロー済み・共通点のないユーザーは含めない", async () => {
    const { a, b, a1 } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    const gone = await insertUser(conn.db);
    const followed = await insertUser(conn.db);
    const stranger = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    for (const u of [fan, gone, followed]) await favorite(u.id, a.id, [a1.id]);
    await favorite(stranger.id, b.id);
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, gone.id));
    await setFollow(conn.db, {
      followerId: me.id,
      followeeId: followed.id,
      following: true,
    });

    expect(idsOf(await getRelatedUsers(conn.db, me.id))).toEqual([fan.id]);
  });

  it("相手が自分をフォローしていても除外しない（自分がフォローした相手だけを除く）", async () => {
    const { a, a1 } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    await favorite(fan.id, a.id, [a1.id]);
    await setFollow(conn.db, {
      followerId: fan.id,
      followeeId: me.id,
      following: true,
    });
    expect(idsOf(await getRelatedUsers(conn.db, me.id))).toEqual([fan.id]);
  });

  it("メンバーから外された（話題タグに戻った）タグは、共通点にしない", async () => {
    const { a, a1 } = await setup();
    const me = await insertUser(conn.db);
    const fan = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    await favorite(fan.id, a.id, [a1.id]);
    await conn.db.update(tags).set({ kind: "topic" }).where(eq(tags.id, a1.id));

    const [related] = (await getRelatedUsers(conn.db, me.id)).users;
    // メンバーの共通点は消え、グループの共通点だけが残る
    expect(related?.commons.map((c) => c.kind)).toEqual(["island"]);
  });

  it("結果は閲覧者ごとに決まり、他のユーザーの推しは混ざらない", async () => {
    const { a, b, a1, b1 } = await setup();
    const meA = await insertUser(conn.db);
    const meB = await insertUser(conn.db);
    const fanA = await insertUser(conn.db);
    const fanB = await insertUser(conn.db);
    await favorite(meA.id, a.id, [a1.id]);
    await favorite(fanA.id, a.id, [a1.id]);
    await favorite(meB.id, b.id, [b1.id]);
    await favorite(fanB.id, b.id, [b1.id]);

    expect(idsOf(await getRelatedUsers(conn.db, meA.id))).toEqual([fanA.id]);
    expect(idsOf(await getRelatedUsers(conn.db, meB.id))).toEqual([fanB.id]);
  });
});

describe("getRelatedUsers: 順位", () => {
  it("推しメンバー > ライブ > 推しグループの順に並ぶ", async () => {
    const { a, b, a1, eventA } = await setup();
    const c = await insertIsland(conn.db);
    const me = await insertUser(conn.db);
    const byGroup = await insertUser(conn.db);
    const byLive = await insertUser(conn.db);
    const byMember = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    await favorite(me.id, b.id);
    await favorite(me.id, c.id);
    await attend(me.id, eventA.id);
    // グループだけが共通（しかも2つ）
    await favorite(byGroup.id, b.id);
    await favorite(byGroup.id, c.id);
    // ライブだけが共通（1つ）
    await attend(byLive.id, eventA.id);
    // メンバーだけが共通（1つ）。ほかの種類の共通点が多くても、メンバーが先
    await favorite(byMember.id, a.id, [a1.id]);

    expect(idsOf(await getRelatedUsers(conn.db, me.id))).toEqual([
      byMember.id,
      byLive.id,
      byGroup.id,
    ]);
  });

  it("同じ種類の中では共通点が多い順、次に合計の多い順に並ぶ", async () => {
    const { a, b, a1, a2, eventA } = await setup();
    const me = await insertUser(conn.db);
    const two = await insertUser(conn.db);
    const oneWithLive = await insertUser(conn.db);
    const one = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id, a2.id]);
    await favorite(me.id, b.id);
    await attend(me.id, eventA.id);
    await favorite(two.id, a.id, [a1.id, a2.id]);
    await favorite(oneWithLive.id, a.id, [a1.id]);
    await attend(oneWithLive.id, eventA.id);
    await favorite(one.id, a.id, [a1.id]);

    expect(idsOf(await getRelatedUsers(conn.db, me.id))).toEqual([
      two.id,
      oneWithLive.id,
      one.id,
    ]);
  });

  it("上位 RELATED_USERS_MAX 人までに切り詰める", async () => {
    const { a, a1 } = await setup();
    const me = await insertUser(conn.db);
    await favorite(me.id, a.id, [a1.id]);
    const rows = [];
    for (let i = 0; i < RELATED_USERS_MAX + 5; i++) {
      const fan = await insertUser(conn.db);
      rows.push({ userId: fan.id, islandId: a.id });
    }
    await conn.db.insert(userFavoriteIslands).values(rows);
    await conn.db
      .insert(userFavoriteMembers)
      .values(rows.map((r) => ({ ...r, tagId: a1.id })));

    const result = await getRelatedUsers(conn.db, me.id);
    expect(result.users).toHaveLength(RELATED_USERS_MAX);
  });
});

describe("getRelatedUsers: 空のとき", () => {
  it("推しも参戦記録もなければ hasCriteria は false", async () => {
    await setup();
    const me = await insertUser(conn.db);
    expect(await getRelatedUsers(conn.db, me.id)).toEqual({
      users: [],
      hasCriteria: false,
    });
  });

  it("推しがあっても共通するユーザーがいなければ、空で hasCriteria は true", async () => {
    const { a } = await setup();
    const me = await insertUser(conn.db);
    await favorite(me.id, a.id);
    expect(await getRelatedUsers(conn.db, me.id)).toEqual({
      users: [],
      hasCriteria: true,
    });
  });

  it("参戦記録だけでも hasCriteria は true", async () => {
    const { eventA } = await setup();
    const me = await insertUser(conn.db);
    await attend(me.id, eventA.id);
    expect((await getRelatedUsers(conn.db, me.id)).hasCriteria).toBe(true);
  });
});

describe("rankRelatedUsers", () => {
  const row = (
    userId: string,
    kind: CommonRow["kind"],
    id: string,
    islandId = "island",
    label = id,
  ): CommonRow => ({
    userId,
    username: `u_${userId}`,
    displayName: `name_${userId}`,
    kind,
    id,
    label,
    islandId,
    islandName: `島_${islandId}`,
  });

  it("入力の順序によらず同じ結果になり、同順位はユーザーIDの昇順", () => {
    const rows = [
      row("c", "member", "m1"),
      row("a", "member", "m1"),
      row("b", "member", "m1"),
    ];
    const expected = ["a", "b", "c"];
    expect(rankRelatedUsers(rows).map((u) => u.id)).toEqual(expected);
    expect(rankRelatedUsers([...rows].reverse()).map((u) => u.id)).toEqual(
      expected,
    );
  });

  it("同じ行が重複して渡されても、1件として数える", () => {
    const [user] = rankRelatedUsers([
      row("a", "member", "m1"),
      row("a", "member", "m1"),
    ]);
    expect(user?.commons).toHaveLength(1);
    expect(user?.moreCount).toBe(0);
  });

  it("同じ種類のバッジは名前順、メンバー・ライブ・グループの順に並べる", () => {
    const [user] = rankRelatedUsers([
      row("a", "island", "i1", "x", "グループ"),
      row("a", "live", "l1", "x", "公演"),
      row("a", "member", "m2", "y", "ゆず"),
      row("a", "member", "m1", "y", "あおい"),
    ]);
    // island x は、メンバーのいる島 y とは別なので残る
    expect(user?.commons.map((c) => c.label)).toEqual([
      "あおい",
      "ゆず",
      "公演",
    ]);
    expect(user?.moreCount).toBe(1);
  });

  it("limit で上位だけを返し、画面に渡す共通点に島IDなどの内部情報を含めない", () => {
    const rows = ["a", "b", "c"].map((id) => row(id, "member", "m1"));
    const ranked = rankRelatedUsers(rows, 2);
    expect(ranked.map((u) => u.id)).toEqual(["a", "b"]);
    expect(Object.keys(ranked[0]?.commons[0] ?? {}).sort()).toEqual([
      "id",
      "islandName",
      "kind",
      "label",
    ]);
  });

  it("行がなければ空", () => {
    expect(rankRelatedUsers([])).toEqual([]);
  });
});
