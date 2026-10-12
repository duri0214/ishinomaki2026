import { inArray, sql } from "drizzle-orm";
import type { Db } from "../src/db/connect";
import { islands, userFavoriteIslands, users } from "../src/db/schema";
import { UNUSABLE_PASSWORD_HASH } from "../src/features/auth/password";

/** 島民数のテスト用のダミーユーザー（seed_fan_00001 など）。ログインはできない */
export const SEED_FAN_PREFIX = "seed_fan_";

/**
 * 島ごとの島民数（推しにしているユーザーの数）の目標。島のレベル（layout.ts の LEVEL_THRESHOLDS）が
 * 島ごとに違って見えるように、Lv2〜Lv5 の境目を少し超える数にしてある
 */
export const DEFAULT_FOLLOWER_TARGETS: Record<string, number> = {
  hoshizora: 10_050, // ARASHI → Lv5（10000人〜）
  shiokaze: 1_200, // TWICE → Lv4（1000人〜）
  tsukiakari: 150, // M!LK → Lv3（100人〜）
  nijiiro: 25, // FRUITSZIPPER → Lv2（10人〜）
};

const chunk = <T>(rows: T[], size = 1000) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

/** _ は LIKE のワイルドカードなのでエスケープする */
const isSeedFan = sql`lower(${users.username}) like ${`${SEED_FAN_PREFIX.replaceAll("_", "\\_")}%`}`;

export type FollowerResult = { slug: string; followers: number }[];

/**
 * 島民数のテストデータを入れる。前回のダミーユーザー（seed_fan_*）を消してから入れ直すので、何度実行しても同じ状態になる。
 * ダミーユーザーは目標の最大数だけ作り、島ごとに先頭から目標の人数がその島を推しにする（1人が複数の島を推しにしてよい）。
 * 見つからない島（slug）は飛ばす。本物のユーザーの推しはそのまま残る
 */
export async function applyFollowers(
  txDb: Db,
  targets: Record<string, number> = DEFAULT_FOLLOWER_TARGETS,
): Promise<FollowerResult> {
  return txDb.transaction(async (tx) => {
    // 前回のダミーユーザーを消す（推しは外部キーの CASCADE で消える）
    await tx.delete(users).where(isSeedFan);

    const found = await tx
      .select({ id: islands.id, slug: islands.slug })
      .from(islands)
      .where(inArray(islands.slug, Object.keys(targets)));
    const max = Math.max(0, ...found.map((i) => targets[i.slug] ?? 0));
    if (max === 0) return [];

    const ids: string[] = [];
    const rows = Array.from({ length: max }, (_, i) => {
      const n = String(i + 1).padStart(5, "0");
      return {
        username: `${SEED_FAN_PREFIX}${n}`,
        passwordHash: UNUSABLE_PASSWORD_HASH,
        displayName: `テストファン${i + 1}`,
      };
    });
    for (const part of chunk(rows)) {
      const inserted = await tx
        .insert(users)
        .values(part)
        .returning({ id: users.id });
      ids.push(...inserted.map((r) => r.id));
    }

    for (const island of found) {
      const count = Math.min(targets[island.slug] ?? 0, ids.length);
      const favorites = ids
        .slice(0, count)
        .map((userId) => ({ userId, islandId: island.id }));
      for (const part of chunk(favorites)) {
        await tx.insert(userFavoriteIslands).values(part);
      }
    }
    return found
      .map((i) => ({ slug: i.slug, followers: targets[i.slug] ?? 0 }))
      .sort((a, b) => b.followers - a.followers);
  });
}
