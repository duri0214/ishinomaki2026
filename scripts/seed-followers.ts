import path from "node:path";
import { connect } from "../src/db/connect";
import { islandLevel } from "../src/features/map/layout";
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
 *   bun run db:seed-followers hoshizora=150 nijiiro=0   （島ごとの人数を変える。slug=人数）
 *
 * 注意: bun run db:seed をやり直すと島が作り直されて推しも消えるので、そのあとにもう一度実行する。
 *       PGlite(ローカル)を使うときは、`bun run dev` を止めてから実行すること。
 */

const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
const pgliteDir = path.resolve(process.env.PGLITE_DIR?.trim() || ".pglite");

if (process.env.NODE_ENV === "production") {
  console.error("NODE_ENV=production ではテストデータを入れられません");
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

// 引数 slug=人数 で目標を上書きする
const targets = { ...DEFAULT_FOLLOWER_TARGETS };
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^([a-z0-9-]+)=(\d+)$/);
  if (!m) {
    console.error(`引数は slug=人数 の形で指定してください: ${arg}`);
    process.exit(1);
  }
  targets[m[1] as string] = Number(m[2]);
}

const conn = await connect(databaseUrl ? { databaseUrl } : { pgliteDir });
console.log(
  `島民数のテストデータを入れます: ${databaseUrl ? `Neon (${new URL(databaseUrl).host})` : `PGlite (${pgliteDir})`}`,
);
const result = await applyFollowers(conn.txDb, targets);
if (result.length === 0) {
  console.log(
    "対象の島が見つかりませんでした（先に bun run db:seed を実行してください）",
  );
}
for (const { slug, followers } of result) {
  console.log(
    `  ${slug}: 島民 ${followers.toLocaleString("ja-JP")}人 → Lv.${islandLevel(followers)}`,
  );
}
await conn.close();
