import { expect, test } from "@playwright/test";

test("トップページが表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("島マップ")).toBeVisible();
});
