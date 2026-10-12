import { expect, type Page, test } from "@playwright/test";

/**
 * アカウント: 登録 → 推しの設定 → プロフィール → 投稿・いいね・削除 → ログアウト → ログイン。
 * ユーザー名は実行ごとに変える（E2E 用の DB は起動時に作り直すが、ローカルでサーバーを使い回す場合に備える）。
 */
const username = `e2e_${Date.now().toString(36)}`;
const password = "e2e-password";

const dialog = (page: Page) => page.getByRole("dialog");

test.describe("アカウント", () => {
  test.describe.configure({ mode: "serial" });

  test("未ログインでは投稿フォームの代わりに案内が出て、いいねすると登録のモーダルが開く", async ({
    page,
  }) => {
    await page.goto("/i/hoshizora");
    await expect(page.getByRole("textbox", { name: "投稿の本文" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "いいね" }).first().click();
    await expect(dialog(page)).toBeVisible();
    await expect(
      dialog(page).getByText("いいねするにはアカウントが必要です"),
    ).toBeVisible();
    await dialog(page).getByRole("button", { name: "閉じる" }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test("登録して推しを選ぶと、プロフィールに表示される。投稿・いいね・削除もできる", async ({
    page,
  }) => {
    await page.goto("/i/hoshizora");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await dialog(page).getByLabel("ユーザー名").fill(username);
    await dialog(page).getByLabel("パスワード").fill(password);
    await dialog(page).getByRole("button", { name: "登録する" }).click();

    // 2ステップ目: 推しを選ぶ
    await expect(
      dialog(page).getByRole("heading", { name: "推しを選ぶ" }),
    ).toBeVisible();
    await dialog(page).getByLabel("表示名").fill("E2Eさん");
    await dialog(page).getByRole("checkbox", { name: "ARASHI" }).check();
    await dialog(page).getByRole("button", { name: "櫻井翔" }).click();
    await dialog(page).getByRole("button", { name: "保存" }).click();
    await expect(dialog(page)).toHaveCount(0);

    // ツールバーのメニューからプロフィールへ
    await page.getByRole("button", { name: "アカウントメニュー" }).click();
    await page.getByRole("menuitem", { name: "プロフィール" }).click();
    await expect(page).toHaveURL(new RegExp(`/u/${username}$`));
    await expect(page.getByRole("heading", { name: "E2Eさん" })).toBeVisible();
    const favorites = page.getByRole("list", { name: "推し", exact: true });
    await expect(favorites.getByRole("link", { name: "ARASHI" })).toBeVisible();
    await expect(favorites.getByRole("link", { name: "櫻井翔" })).toBeVisible();

    // フォロー中のアイドル → 公演 → 記録保存。再読込後も残り、プロフィールで編集できる。
    await page.getByLabel("1. フォロー中のアイドル").selectOption("hoshizora");
    await expect(
      page.getByLabel("1. フォロー中のアイドル").locator("option"),
    ).toHaveCount(2);
    await page.getByLabel("2. ライブを選択").selectOption({ index: 1 });
    await page.getByLabel("感想・メモ（任意）").fill("初参戦の思い出");
    await page.getByRole("button", { name: "参戦記録を保存" }).click();
    await expect(
      page.getByText("初参戦の思い出", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("初参戦の思い出", { exact: true }),
    ).toBeVisible();
    await page.goto("/i/hoshizora");
    await expect(
      page.getByRole("heading", { name: "ライブ参戦記録" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "記録を編集", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("2. ライブを選択")).toHaveCount(0);
    await page.goto(`/u/${username}`);
    await page.getByRole("button", { name: "記録を編集", exact: true }).click();
    const editor = page.getByRole("listitem").filter({
      has: page.getByRole("button", { name: "変更内容を保存", exact: true }),
    });
    await expect(editor.getByLabel("感想・メモ（任意）")).toHaveValue(
      "初参戦の思い出",
    );
    await editor.getByLabel("感想・メモ（任意）").fill("キャンセルするメモ");
    await editor.getByRole("button", { name: "キャンセル" }).click();
    await expect(
      page.getByText("初参戦の思い出", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "記録を編集", exact: true }).click();
    await editor.getByLabel("感想・メモ（任意）").fill("アンコールが最高");
    await editor
      .getByRole("button", { name: "変更内容を保存", exact: true })
      .click();
    await expect(
      page.getByText("アンコールが最高", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "記録を編集", exact: true }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page.getByText("これまでの参戦 · 0公演")).toBeVisible();

    // 投稿 → いいね → 取り消し → 削除
    const body = `E2Eテスト ${Date.now()} #e2eタグ`;
    await page.goto("/i/hoshizora");
    await page.getByRole("textbox", { name: "投稿の本文" }).fill(body);
    await page.getByRole("button", { name: "投稿" }).click();

    const mine = page.getByTestId("post-card").filter({ hasText: body });
    await expect(mine).toBeVisible();
    await expect(mine.getByRole("link", { name: "#e2eタグ" })).toBeVisible();
    await expect(mine.getByRole("link", { name: "E2Eさん" })).toHaveAttribute(
      "href",
      `/u/${username}`,
    );

    await mine.getByRole("button", { name: "いいね" }).click();
    await expect(mine.getByTestId("like-count")).toHaveText("1");
    await mine.getByRole("button", { name: "いいねを取り消す" }).click();
    await expect(mine.getByTestId("like-count")).toHaveText("0");

    page.once("dialog", (d) => d.accept());
    await mine.getByRole("button", { name: "削除" }).click();
    await expect(mine).toHaveCount(0);
  });

  test("ログアウトしてから、同じユーザー名（大文字でも）でログインできる", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await dialog(page).getByRole("tab", { name: "ログイン" }).click();
    await dialog(page).getByLabel("ユーザー名").fill(username.toUpperCase());
    await dialog(page).getByLabel("パスワード").fill("wrong-password");
    await dialog(page).getByRole("button", { name: "ログインする" }).click();
    await expect(
      dialog(page).getByText("ユーザー名かパスワードが違います"),
    ).toBeVisible();

    await dialog(page).getByLabel("パスワード").fill(password);
    await dialog(page).getByRole("button", { name: "ログインする" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "アカウントメニュー" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "アカウントメニュー" }).click();
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(
      page.getByRole("button", { name: "ログイン", exact: true }),
    ).toBeVisible();
  });
});
