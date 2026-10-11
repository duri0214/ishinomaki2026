import "server-only";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { type Connection, connect } from "./connect";

const globalForDb = globalThis as unknown as {
  __dbConnection?: Promise<Connection>;
};

async function open(): Promise<Connection> {
  const env = getEnv();
  if (env.DATABASE_URL) {
    return connect({ databaseUrl: env.DATABASE_URL });
  }
  // DATABASE_URL がなければローカルの PGlite（開発用）。空なら自動でマイグレーションする
  // ローカル専用の処理。本番(Neon)では通らないので、プロジェクト全体をファイルトレースの対象にしない
  const dir = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    env.PGLITE_DIR ?? ".pglite",
  );
  const conn = await connect({ pgliteDir: dir });
  await conn.migrate(
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "drizzle"),
  );
  return conn;
}

/** 接続は開発中のホットリロードをまたいで1つだけ保つ */
function getConnection(): Promise<Connection> {
  globalForDb.__dbConnection ??= open().catch((err) => {
    globalForDb.__dbConnection = undefined;
    throw err;
  });
  return globalForDb.__dbConnection;
}

/** 読み取りと、1文で完結する書き込み用 */
export async function getDb() {
  return (await getConnection()).db;
}

/** `transaction()` が必要な処理用 */
export async function getTxDb() {
  return (await getConnection()).txDb;
}
