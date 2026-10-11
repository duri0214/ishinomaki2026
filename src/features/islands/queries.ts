import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { type Island, islands } from "@/db/schema";

export async function getIslandBySlug(
  db: Db,
  slug: string,
): Promise<Island | undefined> {
  const [row] = await db
    .select()
    .from(islands)
    .where(eq(islands.slug, slug))
    .limit(1);
  return row;
}

/** 島の一覧。世界地図の並びを安定させるため、作成順→IDで並べる */
export async function listIslands(db: Db): Promise<Island[]> {
  return db
    .select()
    .from(islands)
    .orderBy(asc(islands.createdAt), asc(islands.id));
}
