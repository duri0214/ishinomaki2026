import type { Db } from "@/db/connect";
import { liveEvents } from "@/db/schema";

/** 架空の公演。実在のスケジュールと混同しないようタイトルに明示する。 */
export const demoLives = [
  {
    title: "【デモ】Spring Bloom 2026",
    venue: "東京・星空ホール（架空）",
    startsAt: new Date("2026-04-18T18:00:00+09:00"),
  },
  {
    title: "【デモ】Summer Spark Tour",
    venue: "大阪・虹色アリーナ（架空）",
    startsAt: new Date("2026-08-22T17:00:00+09:00"),
  },
  {
    title: "【デモ】Autumn Melody",
    venue: "仙台・月あかりホール（架空）",
    startsAt: new Date("2026-10-03T18:30:00+09:00"),
  },
];

export async function seedDemoLives(db: Db, islandIds: string[]) {
  if (!islandIds.length) return;
  await db
    .insert(liveEvents)
    .values(
      islandIds.flatMap((islandId) =>
        demoLives.map((event) => ({ ...event, islandId })),
      ),
    )
    .onConflictDoNothing();
}
