import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { islandSlugSchema } from "@/lib/validation";
import { getIslandBySlug } from "./queries";

/** ページと generateMetadata で同じ島を引くので、リクエスト内で1回にまとめる */
export const loadIsland = cache(async (slug: string) => {
  if (!islandSlugSchema.safeParse(slug).success) return undefined;
  return getIslandBySlug(await getDb(), slug);
});
