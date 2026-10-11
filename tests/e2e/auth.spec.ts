import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * ログイン後の投稿・いいね・削除。Clerk の開発用インスタンスとテスト用ユーザーが必要なので、
 * 次の環境変数が揃っているときだけ実行する（CI では GitHub Secrets から渡す）。
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY : Clerk の開発用キー
 *   E2E_CLERK_USER_EMAIL : Clerk に作成したテスト用ユーザーのメールアドレス
 */
const configured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.E2E_CLERK_USER_EMAIL,
);

test.describe("ログイン後", () => {
  test.skip(
    !configured,
    "Clerk のテスト用キーとユーザーが未設定のためスキップ",
  );
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await clerkSetup();
  });

  test("投稿 → いいね → 削除ができる", async ({ page }) => {
    await page.goto("/");
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_EMAIL as string,
    });

    const body = `E2Eテスト ${Date.now()} #e2e-tag`;
    await page.goto("/i/hoshizora");
    await page.getByRole("textbox", { name: "投稿の本文" }).fill(body);
    await page.getByRole("button", { name: "投稿" }).click();

    // 投稿がすぐタイムラインの先頭に出る。本文の #タグ はリンクになる
    const mine = page.getByTestId("post-card").filter({ hasText: body });
    await expect(mine).toBeVisible();
    await expect(mine.getByRole("link", { name: "#e2e-tag" })).toBeVisible();

    // いいね（連打しても1件）→ 取り消し
    const like = mine.getByRole("button", { name: "いいね" });
    await like.click();
    await expect(mine.getByTestId("like-count")).toHaveText("1");
    await mine.getByRole("button", { name: "いいねを取り消す" }).click();
    await expect(mine.getByTestId("like-count")).toHaveText("0");

    // 自分の投稿は削除できる
    page.once("dialog", (d) => d.accept());
    await mine.getByRole("button", { name: "削除" }).click();
    await expect(mine).toHaveCount(0);
  });

  test("未ログインのいいねはサインインへ誘導される", async ({ page }) => {
    await page.goto("/i/hoshizora");
    await page.getByRole("button", { name: "いいね" }).first().click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
