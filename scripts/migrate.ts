import path from "node:path";
import { connect } from "../src/db/connect";

// bun が .env / .env.local を自動で読み込む
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
const pgliteDir = path.resolve(process.env.PGLITE_DIR?.trim() || ".pglite");

const conn = await connect(databaseUrl ? { databaseUrl } : { pgliteDir });
const target = databaseUrl
  ? `Neon (${new URL(databaseUrl).host})`
  : `PGlite (${pgliteDir})`;
console.log(`マイグレーションを適用します: ${target}`);
await conn.migrate(path.resolve("drizzle"));
await conn.close();
console.log("完了しました");
