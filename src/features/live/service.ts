import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/connect";
import {
  islands,
  liveEvents,
  liveRecords,
  userFavoriteIslands,
} from "@/db/schema";
import { getFavorites } from "@/features/profile/service";
import { AppError } from "@/lib/errors";

export async function getLiveData(db: Db, userId: string) {
  const favorites = await getFavorites(db, userId);
  const records = await db
    .select({ eventId: liveRecords.eventId, note: liveRecords.note })
    .from(liveRecords)
    .where(eq(liveRecords.userId, userId));
  const followed = db
    .select({ id: userFavoriteIslands.islandId })
    .from(userFavoriteIslands)
    .where(eq(userFavoriteIslands.userId, userId));
  const attended = db
    .select({ id: liveRecords.eventId })
    .from(liveRecords)
    .where(eq(liveRecords.userId, userId));
  const events = await db
    .select({
      id: liveEvents.id,
      islandSlug: islands.slug,
      islandName: islands.name,
      title: liveEvents.title,
      venue: liveEvents.venue,
      startsAt: liveEvents.startsAt,
    })
    .from(liveEvents)
    .innerJoin(islands, eq(islands.id, liveEvents.islandId))
    .where(
      or(
        inArray(liveEvents.islandId, followed),
        inArray(liveEvents.id, attended),
      ),
    )
    .orderBy(asc(liveEvents.startsAt));
  return {
    favorites,
    records,
    events: events.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })),
  };
}
export type LiveData = Awaited<ReturnType<typeof getLiveData>>;
const inputSchema = z.object({
  eventId: z.uuid(),
  note: z.string().trim().max(2000, "メモは2000文字以内で入力してください"),
});

export async function saveLiveRecord(
  db: Db,
  userId: string,
  input: z.input<typeof inputSchema>,
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "入力が不正です",
    );
  const { eventId, note } = parsed.data;
  // INSERT SELECT でフォローの確認と保存を同一文にする。既存記録は解除後も編集可能。
  const allowed = db
    .select({
      userId: sql<string>`${userId}::uuid`.as("user_id"),
      eventId: liveEvents.id,
      note: sql<string>`${note}`.as("note"),
      updatedAt: sql<Date>`now()`.as("updated_at"),
    })
    .from(liveEvents)
    .where(
      and(
        eq(liveEvents.id, eventId),
        or(
          inArray(
            liveEvents.islandId,
            db
              .select({ id: userFavoriteIslands.islandId })
              .from(userFavoriteIslands)
              .where(eq(userFavoriteIslands.userId, userId)),
          ),
          inArray(
            liveEvents.id,
            db
              .select({ id: liveRecords.eventId })
              .from(liveRecords)
              .where(eq(liveRecords.userId, userId)),
          ),
        ),
      ),
    );
  const saved = await db
    .insert(liveRecords)
    .select(allowed)
    .onConflictDoUpdate({
      target: [liveRecords.userId, liveRecords.eventId],
      set: { note, updatedAt: sql`now()` },
    })
    .returning();
  if (!saved.length)
    throw new AppError(
      "forbidden",
      "フォロー中のアイドルのライブを選択してください",
    );
}

export async function deleteLiveRecord(
  db: Db,
  userId: string,
  eventId: string,
) {
  if (!z.uuid().safeParse(eventId).success)
    throw new AppError("validation", "ライブが不正です");
  await db
    .delete(liveRecords)
    .where(
      and(eq(liveRecords.userId, userId), eq(liveRecords.eventId, eventId)),
    );
}
