import { expect, type Page, test } from "@playwright/test";

/**
 * ユーザー同士のフォロー: 未ログインでは案内 → フォロー → 数と一覧に反映 → 解除。
 * ユーザー名は実行ごとに変える。テストの最後でフォローを解除し、DB に関係を残さない。
 */
const suffix = Date.now().toString(36);
const idol = `e2e_idol_${suffix}`;
const fan = `e2e_fan_${suffix}`;
const password = "e2e-password";

const dialog = (page: Page) => page.getByRole("dialog");

async function register(page: Page, username: string, displayName: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await dialog(page).getByLabel("ユーザー名").fill(username);
  await dialog(page).getByLabel("パスワード").fill(password);
  await dialog(page).getByRole("button", { name: "登録する" }).click();
  await dialog(page).getByLabel("表示名").fill(displayName);
  await dialog(page).getByRole("button", { name: "保存" }).click();
  await expect(dialog(page)).toHaveCount(0);
}

test("ユーザーをフォロー・解除でき、数と一覧に反映される", async ({
  browser,
}) => {
  const idolPage = await (await browser.newContext()).newPage();
  await register(idolPage, idol, "フォローされる人");

  const anon = await (await browser.newContext()).newPage();
  const fanPage = await (await browser.newContext()).newPage();
  await register(fanPage, fan, "フォローする人");

  // 未ログインではフォローできず、ログインを促される
  await anon.goto(`/u/${idol}`);
  await anon.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    dialog(anon).getByText("フォローするにはアカウントが必要です"),
  ).toBeVisible();

  // 自分のプロフィールにはフォローボタンがない
  await idolPage.goto(`/u/${idol}`);
  await expect(idolPage.getByRole("button", { name: /^フォロー/ })).toHaveCount(
    0,
  );

  // フォローすると、ボタンと数が変わる
  await fanPage.goto(`/u/${idol}`);
  await fanPage.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    fanPage.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();
  await expect(
    fanPage.getByRole("link", { name: /1\s*フォロワー/ }),
  ).toBeVisible();

  // 一覧に出る。再読込しても残る
  await fanPage.reload();
  await expect(
    fanPage.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();
  await fanPage.getByRole("link", { name: /フォロワー/ }).click();
  await expect(fanPage).toHaveURL(new RegExp(`/u/${idol}/followers$`));
  await expect(
    fanPage
      .getByRole("list", { name: "フォロワー" })
      .getByRole("link", { name: /フォローする人/ }),
  ).toBeVisible();

  await fanPage.goto(`/u/${fan}/following`);
  await expect(
    fanPage
      .getByRole("list", { name: "フォロー中" })
      .getByRole("link", { name: /フォローされる人/ }),
  ).toBeVisible();

  // 解除する
  await fanPage.goto(`/u/${idol}`);
  await fanPage
    .getByRole("button", { name: "フォロー中", exact: true })
    .click();
  await expect(
    fanPage.getByRole("button", { name: "フォロー", exact: true }),
  ).toBeVisible();
  await expect(
    fanPage.getByRole("link", { name: /0\s*フォロワー/ }),
  ).toBeVisible();
  await fanPage.goto(`/u/${fan}/following`);
  await expect(fanPage.getByText("まだ誰もフォローしていません")).toBeVisible();
});
