import { expect, type Page, test } from "@playwright/test";

const TRAITS_URL = "/dev/islands/hoshizora/traits";

/** 選ばれている軸をすべて未評価に戻して保存する（DBのリセットに頼らず、状態を自分で揃える） */
async function clearAllTraits(page: Page) {
  const resets = page.getByRole("button", { name: "未評価に戻す" });
  for (const button of await resets.all()) {
    if (await button.isEnabled()) await button.click();
  }
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
}

test("傾向タグのデバッグツールで5段階を選んで保存すると、再表示しても残る", async ({
  page,
}) => {
  await page.goto("/dev/islands/hoshizora");
  await page.getByRole("link", { name: "傾向タグを編集" }).click();
  await expect(page).toHaveURL(/\/dev\/islands\/hoshizora\/traits$/);

  // 前のテストや手動操作の値が残っていても通るよう、最初に未評価へ揃える
  await clearAllTraits(page);
  try {
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
  } finally {
    // 失敗しても値を残さない
    await page.goto(TRAITS_URL);
    await clearAllTraits(page);
  }
});

test("存在しない島の傾向タグ編集は 404", async ({ page }) => {
  const res = await page.goto("/dev/islands/no-such-island/traits");
  expect(res?.status()).toBe(404);
});
