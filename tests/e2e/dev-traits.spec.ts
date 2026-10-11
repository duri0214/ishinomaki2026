import { expect, test } from "@playwright/test";

test("傾向タグのデバッグツールで5段階を選んで保存すると、再表示しても残る", async ({
  page,
}) => {
  await page.goto("/dev/islands/hoshizora");
  await page.getByRole("link", { name: "傾向タグを編集" }).click();
  await expect(page).toHaveURL(/\/dev\/islands\/hoshizora\/traits$/);

  await page.getByLabel("かわいい ↔ かっこいい: 2").check();
  await page.getByLabel("和 ↔ 洋: 5").check();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");

  await page.reload();
  await expect(page.getByLabel("かわいい ↔ かっこいい: 2")).toBeChecked();
  await expect(page.getByLabel("和 ↔ 洋: 5")).toBeChecked();
  await expect(page.getByLabel("儚さ ↔ 強さ: 3")).not.toBeChecked();

  // 未評価に戻して保存すると、再表示後はどれも選ばれていない
  await page
    .getByTestId("trait-cute-cool")
    .getByRole("button", { name: "未評価に戻す" })
    .click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await page.reload();
  await expect(page.getByLabel("かわいい ↔ かっこいい: 2")).not.toBeChecked();
  await expect(page.getByLabel("和 ↔ 洋: 5")).toBeChecked();
});

test("存在しない島の傾向タグ編集は 404", async ({ page }) => {
  const res = await page.goto("/dev/islands/no-such-island/traits");
  expect(res?.status()).toBe(404);
});
