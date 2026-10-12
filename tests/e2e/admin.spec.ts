import { expect, test } from "@playwright/test";

test("管理者以外には導線の条件と直接アクセス時の案内を表示する", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /管理画面/ })).toBeDisabled();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理画面" })).toBeVisible();
  await expect(
    page.getByText("ユーザー名に admin を含むアカウントで利用できます。"),
  ).toBeVisible();
});
