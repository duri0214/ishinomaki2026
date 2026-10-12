import { expect, type Page, test } from "@playwright/test";

/**
 * 返信: 未ログインでは案内が出る。ログインして投稿に返信すると、スレッドと返信数に反映され、
 * タイムラインには流れない。使った投稿と返信は最後に削除して、DBに残さない。
 */
const username = `e2e_reply_${Date.now().toString(36)}`;
const password = "e2e-password";

const dialog = (page: Page) => page.getByRole("dialog");

test("未ログインで返信を開くと、ログインの案内が出る", async ({ page }) => {
  await page.goto("/i/hoshizora");
  const card = page.getByTestId("post-card").first();
  await card.getByRole("button", { name: "返信を表示" }).click();
  await expect(page.getByRole("textbox", { name: "返信の本文" })).toHaveCount(
    0,
  );
  await card.getByRole("button", { name: "ログイン・新規登録" }).click();
  await expect(
    dialog(page).getByText("返信するにはアカウントが必要です"),
  ).toBeVisible();
});

test("投稿に返信すると、スレッドと返信数に反映され、タイムラインには流れない", async ({
  page,
}) => {
  await page.goto("/i/hoshizora");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await dialog(page).getByLabel("ユーザー名").fill(username);
  await dialog(page).getByLabel("パスワード").fill(password);
  await dialog(page).getByRole("button", { name: "登録する" }).click();
  await expect(
    dialog(page).getByRole("heading", { name: "推しを選ぶ" }),
  ).toBeVisible();
  await dialog(page).getByLabel("表示名").fill("返信E2Eさん");
  await dialog(page).getByRole("checkbox", { name: "ARASHI" }).check();
  await dialog(page).getByRole("button", { name: "櫻井翔" }).click();
  await dialog(page).getByRole("button", { name: "保存" }).click();
  await expect(dialog(page)).toHaveCount(0);

  const stamp = Date.now();
  const body = `返信E2E 元の投稿 ${stamp}`;
  const replyBody = `返信E2E 返信 ${stamp}`;
  await page.getByRole("textbox", { name: "投稿の本文" }).fill(body);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  const card = page.getByTestId("post-card").filter({ hasText: body });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("reply-count")).toHaveText("0");

  try {
    await card.getByRole("button", { name: "返信を表示" }).click();
    await expect(card.getByText("まだ返信がありません")).toBeVisible();
    await card.getByRole("textbox", { name: "返信の本文" }).fill(replyBody);
    await card.getByRole("button", { name: "返信", exact: true }).click();

    const item = card.getByTestId("reply-item").filter({ hasText: replyBody });
    await expect(item).toBeVisible();
    await expect(card.getByTestId("reply-count")).toHaveText("1");

    // 再読み込みしても返信数は残り、返信は独立した投稿としてタイムラインに出ない
    await page.reload();
    await expect(
      page.getByTestId("post-card").filter({ hasText: body }),
    ).toBeVisible();
    await expect(
      page.getByTestId("post-card").filter({ hasText: replyBody }),
    ).toHaveCount(0);
    const reloaded = page.getByTestId("post-card").filter({ hasText: body });
    await expect(reloaded.getByTestId("reply-count")).toHaveText("1");
    await reloaded.getByRole("button", { name: "返信を表示" }).click();
    await expect(
      reloaded.getByTestId("reply-item").filter({ hasText: replyBody }),
    ).toBeVisible();

    // 返信を削除すると、一覧と返信数から消える
    page.once("dialog", (d) => d.accept());
    await reloaded.getByRole("button", { name: "返信を削除" }).click();
    await expect(reloaded.getByTestId("reply-item")).toHaveCount(0);
    await expect(reloaded.getByTestId("reply-count")).toHaveText("0");
  } finally {
    // 失敗しても投稿を残さない
    await page.goto("/i/hoshizora");
    const leftover = page.getByTestId("post-card").filter({ hasText: body });
    if (await leftover.count()) {
      page.once("dialog", (d) => d.accept());
      await leftover.getByRole("button", { name: "削除" }).click();
      await expect(leftover).toHaveCount(0);
    }
  }
});
