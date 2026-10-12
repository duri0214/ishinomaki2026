import { arrangeIslands } from "./arrange-islands-apply";
import { openDevDb } from "./dev-db";

/**
 * 今ある島を、世界地図で2段に並ぶように置き直す（島が横一列に並んでしまったとき用）。
 * 新しく作る島は、createIsland が最初から2段の並びの空いている場所に置く。
 *
 * 使い方:
 *   bun run db:arrange-islands                       （ローカルの PGlite。`bun run dev` を止めてから）
 *   ALLOW_SEED_REMOTE=1 bun run db:arrange-islands   （.env.local の DATABASE_URL。Neon の dev ブランチであることを確認してから）
 */

const { conn, label } = await openDevDb();
console.log(`島を2段に並べ直します: ${label}`);
for (const { slug, name, x, y } of await arrangeIslands(conn.txDb)) {
  console.log(`  ${name} (${slug}): (${x}, ${y})`);
}
await conn.close();
