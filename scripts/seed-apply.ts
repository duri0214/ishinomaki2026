import { inArray, sql } from "drizzle-orm";
import type { Db } from "../src/db/connect";
import { islands, likes, posts, postTags, tags, users } from "../src/db/schema";
import {
  SEED_ISLAND_SLUGS,
  SEED_USER_PREFIX,
  type SeedData,
} from "./seed-data";

const chunk = <T>(rows: T[], size = 500) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

/** シードのユーザー（seed_user_N）。_ は LIKE のワイルドカードなのでエスケープする */
const isSeedUser = sql`lower(${users.username}) like ${`${SEED_USER_PREFIX.replaceAll("_", "\\_")}%`}`;

/**
 * シードを入れる。前回のシード（SEED_ISLAND_SLUGS の島とダミーユーザー）を消してから入れ直すので、
 * 何度実行しても同じ状態に戻る。`txDb` は transaction() が使える接続。
 */
export async function applySeed(txDb: Db, seed: SeedData): Promise<void> {
  await txDb.transaction(async (tx) => {
    // 前回のシードを消す（外部キーの順に）
    const oldUsers = tx.select({ id: users.id }).from(users).where(isSeedUser);
    await tx.delete(likes).where(inArray(likes.userId, oldUsers));
    await tx.delete(posts).where(inArray(posts.authorId, oldUsers));
    await tx
      .delete(islands)
      .where(inArray(islands.slug, [...SEED_ISLAND_SLUGS]));
    await tx.delete(users).where(isSeedUser);

    await tx.insert(users).values(seed.users);
    await tx.insert(islands).values(seed.islands);
    for (const rows of chunk(seed.tags)) await tx.insert(tags).values(rows);
    for (const rows of chunk(seed.posts)) await tx.insert(posts).values(rows);
    for (const rows of chunk(seed.postTags)) {
      await tx.insert(postTags).values(rows);
    }
    for (const rows of chunk(seed.likes)) await tx.insert(likes).values(rows);
  });
}
