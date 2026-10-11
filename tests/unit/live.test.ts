import { afterAll, beforeAll, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { liveEvents, userFavoriteIslands } from "@/db/schema";
import { seedDemoLives } from "@/features/live/demo";
import {
  deleteLiveRecord,
  getLiveData,
  saveLiveRecord,
} from "@/features/live/service";
import { updateProfile } from "@/features/profile/service";
import { createTestDb } from "../helpers/db";
import { insertIsland, insertUser } from "../helpers/fixtures";

let conn: Connection;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(async () => {
  await conn.close();
});

it("フォロー中の公演を保存・更新でき、他人の記録には影響しない。解除後も編集できる", async () => {
  const island = await insertIsland(conn.db);
  const user = await insertUser(conn.db);
  const other = await insertUser(conn.db);
  await seedDemoLives(conn.db, [island.id]);
  await seedDemoLives(conn.db, [island.id]);
  await conn.db
    .insert(userFavoriteIslands)
    .values({ userId: user.id, islandId: island.id });
  const data = await getLiveData(conn.db, user.id);
  expect(data.events).toHaveLength(3);
  const eventId = data.events[0]?.id as string;
  await expect(
    saveLiveRecord(conn.db, other.id, { eventId, note: "他人" }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await saveLiveRecord(conn.db, user.id, { eventId, note: " 初参戦 " });
  await saveLiveRecord(conn.db, user.id, { eventId, note: "最高だった" });
  expect((await getLiveData(conn.db, user.id)).records).toEqual([
    { eventId, note: "最高だった" },
  ]);
  expect((await getLiveData(conn.db, other.id)).records).toEqual([]);
  await deleteLiveRecord(conn.db, other.id, eventId);
  expect((await getLiveData(conn.db, user.id)).records).toHaveLength(1);
  await updateProfile(conn.txDb, user.id, {
    displayName: "fan",
    favorites: [],
  });
  await saveLiveRecord(conn.db, user.id, { eventId, note: "思い出" });
  expect((await getLiveData(conn.db, user.id)).records[0]?.note).toBe("思い出");
  await deleteLiveRecord(conn.db, user.id, eventId);
  expect((await getLiveData(conn.db, user.id)).records).toEqual([]);
});

it("存在しない公演・不正なID・長すぎるメモを拒否する", async () => {
  const user = await insertUser(conn.db);
  await expect(
    saveLiveRecord(conn.db, user.id, {
      eventId: crypto.randomUUID(),
      note: "",
    }),
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    saveLiveRecord(conn.db, user.id, { eventId: "bad", note: "" }),
  ).rejects.toMatchObject({ code: "validation" });
  const island = await insertIsland(conn.db);
  await conn.db.insert(liveEvents).values({
    islandId: island.id,
    title: "test",
    venue: "test",
    startsAt: new Date(),
  });
  await expect(
    saveLiveRecord(conn.db, user.id, {
      eventId: crypto.randomUUID(),
      note: "あ".repeat(2001),
    }),
  ).rejects.toMatchObject({ code: "validation" });
});
