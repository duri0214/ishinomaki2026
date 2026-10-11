import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  // 開発サーバーは初回アクセス時にルートをコンパイルするので、長めにとる
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    // CI では `playwright install chromium` を実行する。ローカルでは手元のChromeを使う
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run db:reset-e2e && bun x next dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2E は必ずローカルのPGliteを使う（.env.local に DATABASE_URL があっても無視する）
    env: { PGLITE_DIR: ".pglite-e2e", DATABASE_URL: "" },
  },
});
