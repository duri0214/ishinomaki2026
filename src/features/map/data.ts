import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import type { Db } from "@/db/connect";
import { tags, userFavoriteIslands } from "@/db/schema";
import { listIslands } from "@/features/islands/queries";
import {
  getTopTopicTags,
  listMemberTags,
  type RankedTag,
} from "@/features/tags/queries";
import { BASE_NAMES } from "./assets";
import { fillTopTags, MAP_TOPIC_HOUSES } from "./layout";
import type { MapIslandData } from "./types";

/** 上位20件の集計はコストが高めなので、島ごとに5分キャッシュする */
export const TOP_TAGS_REVALIDATE_SECONDS = 5 * 60;

const getCachedTopTags = unstable_cache(
  async (islandId: string) => getTopTopicTags(await getDb(), islandId),
  ["top-topic-tags"],
  { revalidate: TOP_TAGS_REVALIDATE_SECONDS, tags: ["top-tags"] },
);

/** 島民数のキャッシュのタグ。推しグループを保存したら updateTag で消す */
export const ISLAND_FOLLOWERS_CACHE_TAG = "island-followers";
/** 新しい話題タグのキャッシュのタグ。島エディタで家を建てたら updateTag で消す */
export const NEW_TOPIC_TAGS_CACHE_TAG = "new-topic-tags";

/** 島ごとの島民数（その島を推しグループにしているユーザーの数） */
async function countIslandFollowers(
  db: Db,
): Promise<{ islandId: string; followers: number }[]> {
  return db
    .select({ islandId: userFavoriteIslands.islandId, followers: count() })
    .from(userFavoriteIslands)
    .groupBy(userFavoriteIslands.islandId);
}

/** 島民数は全島まとめて5分キャッシュする（Map は JSON にできないので、配列のまま保存する） */
const getCachedIslandFollowers = unstable_cache(
  async () => countIslandFollowers(await getDb()),
  ["island-followers"],
  {
    revalidate: TOP_TAGS_REVALIDATE_SECONDS,
    tags: [ISLAND_FOLLOWERS_CACHE_TAG],
  },
);

/** 新しく作られた話題タグ（投稿がまだなくても家を建てるため） */
async function listNewTopicTags(
  db: Db,
  islandId: string,
  limit: number,
): Promise<RankedTag[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      normalizedName: tags.normalizedName,
      imageUrl: tags.imageUrl,
    })
    .from(tags)
    .where(and(eq(tags.islandId, islandId), eq(tags.kind, "topic")))
    .orderBy(desc(tags.createdAt), desc(tags.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, postCount: 0 }));
}

/** 新しい話題タグも、上位と同じく島ごとに5分キャッシュする */
const getCachedNewTopicTags = unstable_cache(
  async (islandId: string, limit: number) =>
    listNewTopicTags(await getDb(), islandId, limit),
  ["new-topic-tags"],
  {
    revalidate: TOP_TAGS_REVALIDATE_SECONDS,
    tags: [NEW_TOPIC_TAGS_CACHE_TAG],
  },
);

/** 島エディタで選んだ土台（islands.theme.base）。なければ作成順に割り当てる */
function baseOf(theme: unknown, index: number): string {
  const chosen = (theme as { base?: unknown } | null)?.base;
  return typeof chosen === "string" && BASE_NAMES.includes(chosen)
    ? chosen
    : (BASE_NAMES[index % BASE_NAMES.length] as string);
}

/**
 * マップの描画に必要なデータ（全島、メンバー、上位20件）をまとめて取得する。
 * (main)/layout.tsx で1回だけ取得してクライアントへ渡す。
 */
export async function getMapData(): Promise<MapIslandData[]> {
  const db = await getDb();
  const [islands, followerRows] = await Promise.all([
    listIslands(db),
    getCachedIslandFollowers(),
  ]);
  const followers = new Map(followerRows.map((r) => [r.islandId, r.followers]));
  return Promise.all(
    islands.map(async (island, index) => {
      const [members, ranked] = await Promise.all([
        listMemberTags(db, island.id),
        getCachedTopTags(island.id),
      ]);
      const topTags =
        ranked.length >= MAP_TOPIC_HOUSES
          ? ranked
          : fillTopTags(
              ranked,
              await getCachedNewTopicTags(island.id, MAP_TOPIC_HOUSES),
            );
      return {
        id: island.id,
        slug: island.slug,
        name: island.name,
        worldX: island.worldX,
        worldY: island.worldY,
        imageUrl: island.imageUrl,
        // 土台は島エディタで選んだもの。未選択なら作成順（4島なら全部ちがう土台になる）
        base: baseOf(island.theme, index),
        population: followers.get(island.id) ?? 0,
        members,
        topTags,
      };
    }),
  );
}
