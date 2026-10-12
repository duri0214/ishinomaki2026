import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { userFollows, users } from "@/db/schema";
import {
  getFollowStats,
  listFollows,
  setFollow,
} from "@/features/follow/service";
import { AppError } from "@/lib/errors";
import { createTestDb } from "../helpers/db";
import { insertUser } from "../helpers/fixtures";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("setFollow", () => {
  it("フォローと解除は冪等で、フォロワー数を返す", async () => {
    const a = await insertUser(conn.db);
    const b = await insertUser(conn.db);
    const follow = (following: boolean) =>
      setFollow(conn.db, {
        followerId: a.id,
        followeeId: b.id,
        following,
      });

    expect(await follow(true)).toEqual({ following: true, followerCount: 1 });
    expect(await follow(true)).toEqual({ following: true, followerCount: 1 });
    expect(await follow(false)).toEqual({ following: false, followerCount: 0 });
    expect(await follow(false)).toEqual({ following: false, followerCount: 0 });
  });

  it("自分自身はフォローできない", async () => {
    const a = await insertUser(conn.db);
    await expect(
      setFollow(conn.db, {
        followerId: a.id,
        followeeId: a.id,
        following: true,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("存在しない・退会済みのユーザーはフォローできないが、解除はできる", async () => {
    const a = await insertUser(conn.db);
    const gone = await insertUser(conn.db);
    await setFollow(conn.db, {
      followerId: a.id,
      followeeId: gone.id,
      following: true,
    });
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, gone.id));

    await expect(
      setFollow(conn.db, {
        followerId: a.id,
        followeeId: gone.id,
        following: true,
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      setFollow(conn.db, {
        followerId: a.id,
        followeeId: "00000000-0000-4000-8000-000000000000",
        following: true,
      }),
    ).rejects.toMatchObject({ code: "user_not_found" });

    await setFollow(conn.db, {
      followerId: a.id,
      followeeId: gone.id,
      following: false,
    });
    expect(
      await conn.db
        .select()
        .from(userFollows)
        .where(eq(userFollows.followerId, a.id)),
    ).toHaveLength(0);
  });

  it("DB の制約でも自己フォローを拒否する", async () => {
    const a = await insertUser(conn.db);
    await expect(
      conn.db
        .insert(userFollows)
        .values({ followerId: a.id, followeeId: a.id }),
    ).rejects.toThrow();
  });
});

describe("getFollowStats / listFollows", () => {
  it("数と一覧は退会済みユーザーを除き、閲覧者のフォロー済みを返す", async () => {
    const me = await insertUser(conn.db, "me");
    const target = await insertUser(conn.db, "target");
    const fan = await insertUser(conn.db, "fan");
    const goneFan = await insertUser(conn.db, "gonefan");
    const idol = await insertUser(conn.db, "idol");
    const add = (followerId: string, followeeId: string) =>
      setFollow(conn.db, { followerId, followeeId, following: true });
    await add(me.id, target.id);
    await add(fan.id, target.id);
    await add(goneFan.id, target.id);
    await add(target.id, idol.id);
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, goneFan.id));

    expect(await getFollowStats(conn.db, target.id, me.id)).toEqual({
      followerCount: 2,
      followingCount: 1,
      followedByMe: true,
    });
    expect(
      (await getFollowStats(conn.db, target.id, fan.id)).followedByMe,
    ).toBe(true);
    expect(
      (await getFollowStats(conn.db, target.id, idol.id)).followedByMe,
    ).toBe(false);
    expect(await getFollowStats(conn.db, target.id, null)).toMatchObject({
      followedByMe: false,
    });
    // 本人のプロフィールでは常に false
    expect(
      (await getFollowStats(conn.db, target.id, target.id)).followedByMe,
    ).toBe(false);

    const followers = await listFollows(conn.db, target.id, "followers");
    expect(followers.map((u) => u.id).sort()).toEqual([me.id, fan.id].sort());
    const following = await listFollows(conn.db, target.id, "following");
    expect(following.map((u) => u.id)).toEqual([idol.id]);
  });
});
