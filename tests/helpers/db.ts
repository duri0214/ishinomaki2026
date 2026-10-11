import path from "node:path";
import { type Connection, connect } from "@/db/connect";

/** メモリ上のPGliteにマイグレーションを適用したDBを作る */
export async function createTestDb(): Promise<Connection> {
  const conn = await connect({});
  await conn.migrate(path.resolve(process.cwd(), "drizzle"));
  return conn;
}
