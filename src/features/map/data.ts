import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { listIslands } from "@/features/islands/queries";
import { getTopTopicTags, listMemberTags } from "@/features/tags/queries";
import type { MapIslandData } from "./types";

/** 上位20件の集計はコストが高めなので、島ごとに5分キャッシュする */
export const TOP_TAGS_REVALIDATE_SECONDS = 5 * 60;

const getCachedTopTags = unstable_cache(
  async (islandId: string) => getTopTopicTags(await getDb(), islandId),
  ["top-topic-tags"],
  { revalidate: TOP_TAGS_REVALIDATE_SECONDS, tags: ["top-tags"] },
);

/**
 * マップの描画に必要なデータ（全島、メンバー、上位20件）をまとめて取得する。
 * (main)/layout.tsx で1回だけ取得してクライアントへ渡す。
 */
export async function getMapData(): Promise<MapIslandData[]> {
  const db = await getDb();
  const islands = await listIslands(db);
  return Promise.all(
    islands.map(async (island) => {
      const [members, topTags] = await Promise.all([
        listMemberTags(db, island.id),
        getCachedTopTags(island.id),
      ]);
      return {
        id: island.id,
        slug: island.slug,
        name: island.name,
        worldX: island.worldX,
        worldY: island.worldY,
        imageUrl: island.imageUrl,
        members,
        topTags,
      };
    }),
  );
}
