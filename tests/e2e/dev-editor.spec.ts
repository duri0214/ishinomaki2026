import { expect, test } from "@playwright/test";

test("島エディタで島を作り、メンバーを置くと、世界地図と島ビューに反映される", async ({
  page,
}) => {
  await page.goto("/dev/islands");
  await expect(page.getByText("開発専用の島エディタです")).toBeVisible();

  await page.getByLabel(/^slug/).fill("e2e-island");
  await page.getByLabel("名前", { exact: true }).fill("テスト島");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/dev\/islands\/e2e-island$/);

  // メンバーを追加して保存
  await page.getByLabel("追加するメンバー名").fill("てすと");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByTestId("member-handle-てすと")).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");

  // 保存した内容が、世界地図と島ビューにすぐ出る
  await page.goto("/");
  await expect(page.getByTestId("island-e2e-island")).toBeVisible();
  await page.goto("/i/e2e-island");
  await expect(page.getByTestId("house-てすと")).toBeVisible();
});

test("slug が重複したり不正なときはエラーを表示する", async ({ page }) => {
  await page.goto("/dev/islands");
  await page.getByLabel(/^slug/).fill("hoshizora");
  await page.getByLabel("名前", { exact: true }).fill("重複");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByText("その slug は既に使われています")).toBeVisible();
});
