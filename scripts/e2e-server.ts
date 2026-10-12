import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { like } from "drizzle-orm";
import { connect } from "../src/db/connect";
import { users } from "../src/db/schema";

// Playwright専用。停止後にDBを開き、DMのテストユーザーと関連データをCASCADEで片付ける。
const dir = path.resolve(process.env.PGLITE_DIR ?? ".pglite-e2e");
if (process.env.DATABASE_URL?.trim() || path.basename(dir) !== ".pglite-e2e") {
  throw new Error("E2Eサーバーはローカルの .pglite-e2e のみで実行できます");
}
execFileSync(process.execPath, ["scripts/reset-e2e.ts"], { stdio: "inherit" });
const server = spawn("bun", ["x", "next", "dev", "--port", "3100"], {
  stdio: "inherit",
});
let stopping = false;
const stop = () => {
  if (!stopping) {
    stopping = true;
    server.kill("SIGTERM");
  }
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
const exitCode = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 0));
});
const conn = await connect({ pgliteDir: dir });
try {
  await conn.db.delete(users).where(like(users.username, "e2e\\_dm\\_%"));
} finally {
  await conn.close();
}
process.exitCode = stopping ? 0 : exitCode;
