import { eq } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { islands } from "@/db/schema";
import type { ArtistProfile } from "./types";

/** 接続先の islands に登録された名前・説明だけを読み取る。 */
export async function getArtistProfile(
  db: Db,
  slug: string,
): Promise<ArtistProfile | undefined> {
  const [profile] = await db
    .select({ name: islands.name, description: islands.description })
    .from(islands)
    .where(eq(islands.slug, slug))
    .limit(1);
  return profile;
}
