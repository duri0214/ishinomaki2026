import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { userFavoriteMembers, users } from "@/db/schema";
import {
  getFavorites,
  getProfileByUsername,
  updateProfile,
} from "@/features/profile/service";
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

async function setup() {
  const a = await insertIsland(conn.db);
  const b = await insertIsland(conn.db);
  const aMember1 = await insertTag(conn.db, a.id, "みさき", "member");
  const aMember2 = await insertTag(conn.db, a.id, "ひなた", "member");
  const aTopic = await insertTag(conn.db, a.id, "ライブ", "topic");
  const bMember = await insertTag(conn.db, b.id, "あおい", "member");
  const user = await insertUser(conn.db);
  return { a, b, aMember1, aMember2, aTopic, bMember, user };
}

describe("updateProfile", () => {
  it("表示名と推しを保存し、全置き換えする。島は選んだ順に返す", async () => {
    const { a, b, aMember1, aMember2, bMember, user } = await setup();
    await updateProfile(conn.txDb, user.id, {
      displayName: "  ねる  ",
      favorites: [
        { islandSlug: b.slug, memberTagIds: [bMember.id] },
        { islandSlug: a.slug, memberTagIds: [aMember1.id, aMember2.id] },
      ],
    });
    let favorites = await getFavorites(conn.db, user.id);
    expect(favorites.map((f) => f.island.slug)).toEqual([b.slug, a.slug]);
    expect(favorites[1]?.members.map((m) => m.name)).toEqual([
      "ひなた",
      "みさき",
    ]);
    const row = must(
      (await conn.db.select().from(users).where(eq(users.id, user.id)))[0],
    );
    expect(row.displayName).toBe("ねる");

    // メンバーなしのグループだけにする
    await updateProfile(conn.txDb, user.id, {
      displayName: "ねる",
      favorites: [{ islandSlug: a.slug, memberTagIds: [] }],
    });
    favorites = await getFavorites(conn.db, user.id);
    expect(favorites).toEqual([
      { island: { slug: a.slug, name: a.name }, members: [] },
    ]);
    const members = await conn.db
      .select()
      .from(userFavoriteMembers)
      .where(eq(userFavoriteMembers.userId, user.id));
    expect(members).toHaveLength(0);
  });

  it("別の島のメンバーや話題タグは推しメンバーにできず、何も変更しない", async () => {
    const { a, aMember1, aTopic, bMember, user } = await setup();
    await updateProfile(conn.txDb, user.id, {
      displayName: "before",
      favorites: [{ islandSlug: a.slug, memberTagIds: [aMember1.id] }],
    });
    for (const tagId of [bMember.id, aTopic.id]) {
      await expect(
        updateProfile(conn.txDb, user.id, {
          displayName: "after",
          favorites: [{ islandSlug: a.slug, memberTagIds: [tagId] }],
        }),
      ).rejects.toMatchObject({ code: "validation" });
    }
    const favorites = await getFavorites(conn.db, user.id);
    expect(favorites[0]?.members.map((m) => m.id)).toEqual([aMember1.id]);
  });

  it("存在しない島・重複した島・空の表示名・長すぎる表示名はエラー", async () => {
    const { a, user } = await setup();
    await expect(
      updateProfile(conn.txDb, user.id, {
        displayName: "x",
        favorites: [{ islandSlug: "no-such-island", memberTagIds: [] }],
      }),
    ).rejects.toMatchObject({ code: "island_not_found" });
    await expect(
      updateProfile(conn.txDb, user.id, {
        displayName: "x",
        favorites: [
          { islandSlug: a.slug, memberTagIds: [] },
          { islandSlug: a.slug, memberTagIds: [] },
        ],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    for (const displayName of ["   ", "あ".repeat(51)]) {
      await expect(
        updateProfile(conn.txDb, user.id, { displayName, favorites: [] }),
      ).rejects.toMatchObject({ code: "validation" });
    }
  });
});

describe("getProfileByUsername", () => {
  it("大文字・小文字を区別せずに探し、退会済みなら見つからない", async () => {
    const { a, aMember1, user } = await setup();
    await updateProfile(conn.txDb, user.id, {
      displayName: "表示名",
      favorites: [{ islandSlug: a.slug, memberTagIds: [aMember1.id] }],
    });
    const profile = must(
      await getProfileByUsername(conn.db, user.username.toUpperCase()),
    );
    expect(profile).toMatchObject({
      id: user.id,
      username: user.username,
      displayName: "表示名",
    });
    expect(profile.favorites[0]?.members[0]?.normalizedName).toBe(
      aMember1.normalizedName,
    );
    expect(await getProfileByUsername(conn.db, "nobody")).toBeUndefined();

    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.id));
    expect(await getProfileByUsername(conn.db, user.username)).toBeUndefined();
  });
});
