import { defineConfig } from "drizzle-kit";

// マイグレーションSQLの生成にDB接続は不要。適用は scripts/migrate.ts で行う。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
