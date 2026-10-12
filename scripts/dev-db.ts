import path from "node:path";
import { type Connection, connect } from "../src/db/connect";

/**
 * テストデータ用スクリプトが使う DB への接続。
 * DATABASE_URL があれば Neon、なければローカルの PGlite（PGLITE_DIR か .pglite）。
 * 本番に誤って書き込まないよう、NODE_ENV=production では止め、DATABASE_URL のときは ALLOW_SEED_REMOTE=1 を求める
 */
export async function openDevDb(): Promise<{
  conn: Connection;
  label: string;
}> {
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
  const conn = await connect(databaseUrl ? { databaseUrl } : { pgliteDir });
  const label = databaseUrl
    ? `Neon (${new URL(databaseUrl).host})`
    : `PGlite (${pgliteDir})`;
  return { conn, label };
}
