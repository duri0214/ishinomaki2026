import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/** E2E 用のローカルDB(PGlite)を作り直してシードを入れる。毎回同じ状態から始めるため */
const dir = path.resolve(process.env.PGLITE_DIR?.trim() || ".pglite-e2e");
if (path.basename(dir) !== ".pglite-e2e") {
  console.error(
    `安全のため、${dir} は削除しません（E2E 用は .pglite-e2e のみ）`,
  );
  process.exit(1);
}
if (process.env.DATABASE_URL?.trim()) {
  console.error(
    "DATABASE_URL が設定されているため実行しません（E2E はローカルのPGliteだけを使います）",
  );
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
execFileSync(process.execPath, ["scripts/seed.ts"], {
  stdio: "inherit",
  env: { ...process.env, PGLITE_DIR: dir },
});
