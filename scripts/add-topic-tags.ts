import { applyTopicTags } from "./add-topic-tags-apply";
import { openDevDb } from "./dev-db";
import { ISLAND_TOPIC_TAGS } from "./seed-data";

/**
 * 既存の島に、島ごとの話題タグ（seed-data.ts の ISLAND_TOPIC_TAGS）だけを追加する。
 * db:seed と違って島は作り直さないので、管理画面や島エディタで編集した内容は残る。
 * すでにあるタグは追加しないので、何度実行しても同じ結果になる。
 *
 * 使い方:
 *   bun run db:add-topic-tags                       （ローカルの PGlite）
 *   ALLOW_SEED_REMOTE=1 bun run db:add-topic-tags   （.env.local の DATABASE_URL。Neon の dev ブランチであることを確認してから）
 *
 * 注意: PGlite(ローカル)を使うときは、`bun run dev` を止めてから実行すること。
 */

const { conn, label } = await openDevDb();
console.log(`話題タグを追加します: ${label}`);
const result = await applyTopicTags(conn.db, ISLAND_TOPIC_TAGS);

for (const { slug, name, added } of result) {
  console.log(
    `  ${name} (${slug}): ${added.length > 0 ? `+${added.length}件 ${added.join("、")}` : "追加なし（すべて登録済み）"}`,
  );
}
const found = new Set(result.map((r) => r.slug));
for (const slug of Object.keys(ISLAND_TOPIC_TAGS)) {
  if (!found.has(slug))
    console.log(`  ${slug}: 島が見つからないので飛ばしました`);
}
await conn.close();
