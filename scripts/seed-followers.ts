import { islands } from "../src/db/schema";
import { islandLevel } from "../src/features/map/layout";
import { openDevDb } from "./dev-db";
import {
  applyFollowers,
  DEFAULT_FOLLOWER_TARGETS,
} from "./seed-followers-apply";

/**
 * 島民数（推しにしているユーザーの数）のテストデータを入れて、島ごとにレベル（Lv1〜Lv5）が違って見えるようにする。
 * 何度実行しても同じ状態に戻る（ダミーユーザー seed_fan_* を消して入れ直す）。
 *
 * 使い方:
 *   bun run db:seed-followers                       （ローカルの PGlite）
 *   ALLOW_SEED_REMOTE=1 bun run db:seed-followers   （.env.local の DATABASE_URL。Neon の dev ブランチであることを確認してから）
 *   bun run db:seed-followers hoshizora=150 嵐=150   （島ごとの人数を変える。slug か島の名前=人数）
 *
 * 注意: bun run db:seed をやり直すと島が作り直されて推しも消えるので、そのあとにもう一度実行する。
 *       PGlite(ローカル)を使うときは、`bun run dev` を止めてから実行すること。
 *       マップの島民数は5分キャッシュされるので、反映まで最大5分かかる。
 */

// 引数 slug=人数（または 島の名前=人数）で目標を上書きする
const targets = { ...DEFAULT_FOLLOWER_TARGETS };
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^(.+)=(\d+)$/);
  if (!m) {
    console.error(`引数は slug=人数 の形で指定してください: ${arg}`);
    process.exit(1);
  }
  targets[m[1] as string] = Number(m[2]);
}

const { conn, label } = await openDevDb();
console.log(`島民数のテストデータを入れます: ${label}`);
const result = await applyFollowers(conn.txDb, targets);
if (result.length === 0) {
  console.log(
    "対象の島が見つかりませんでした（先に bun run db:seed を実行してください）",
  );
}
for (const { slug, name, followers } of result) {
  console.log(
    `  ${name} (${slug}): ダミーの島民 ${followers.toLocaleString("ja-JP")}人 → Lv.${islandLevel(followers)}`,
  );
}
// 対象にしなかった島も出しておく（slug を調べて、引数で指定し直せるように）
const applied = new Set(result.map((r) => r.slug));
const others = (
  await conn.db.select({ slug: islands.slug, name: islands.name }).from(islands)
).filter((i) => !applied.has(i.slug));
if (others.length > 0) {
  console.log("対象外の島（slug=人数 か 名前=人数 で指定できます）:");
  for (const { slug, name } of others) console.log(`  ${name} (${slug})`);
}
console.log(
  "※ マップの島民数は5分キャッシュされます。反映まで最大5分お待ちください",
);
await conn.close();
