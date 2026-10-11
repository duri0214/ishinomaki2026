import path from "node:path";
import { connect } from "../src/db/connect";
import { islands, posts, tags } from "../src/db/schema";
import { applySeed } from "./seed-apply";
import { generateSeed } from "./seed-data";

/**
 * 開発用のシードを入れる。何度実行しても同じ状態に戻る。
 * シードが作った島とダミーユーザーだけを消して入れ直すので、島エディタで作った別の島は消えない。
 *
 * 注意: PGlite(ローカル)を使うときは、`bun run dev` を止めてから実行すること。
 */

const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
const pgliteDir = path.resolve(process.env.PGLITE_DIR?.trim() || ".pglite");

if (process.env.NODE_ENV === "production") {
  console.error("NODE_ENV=production ではシードを実行できません");
  process.exit(1);
}
if (databaseUrl && process.env.ALLOW_SEED_REMOTE !== "1") {
  const host = new URL(databaseUrl).host;
  console.error(
    `DATABASE_URL (${host}) が設定されています。誤って本番DBに投入しないよう、実行を止めました。\n` +
      "Neon の dev ブランチであることを確認したうえで、ALLOW_SEED_REMOTE=1 を付けて再実行してください。",
  );
  process.exit(1);
}

const conn = await connect(databaseUrl ? { databaseUrl } : { pgliteDir });
console.log(
  `シードを投入します: ${databaseUrl ? `Neon (${new URL(databaseUrl).host})` : `PGlite (${pgliteDir})`}`,
);
await conn.migrate(path.resolve("drizzle"));

const seed = generateSeed(new Date());
await applySeed(conn.txDb, seed);

const [islandCount, tagCount, postCount] = await Promise.all([
  conn.db.$count(islands),
  conn.db.$count(tags),
  conn.db.$count(posts),
]);
console.log(
  `完了: 島 ${islandCount} / タグ ${tagCount} / 投稿 ${postCount} / ユーザー ${seed.users.length} / いいね ${seed.likes.length}`,
);
await conn.close();
