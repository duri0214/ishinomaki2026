import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

/**
 * スマホ: ログイン後もマップ・集合写真・投稿フォームの下に投稿一覧の表示領域が残り、
 * 投稿・いいね・返信・追加読み込みをタッチで操作できる（#32）。
 * 狭い・低い画面ではページ全体をスクロールし、一覧だけの二重スクロールにしない。
 */
const username = `e2e_mobile_${Date.now().toString(36)}`;
const password = "e2e-password";

const VIEWPORTS = [
  { width: 375, height: 548 },
  { width: 390, height: 664 },
  { width: 375, height: 667 },
  { width: 393, height: 727 },
  { width: 667, height: 375 },
];

const dialog = (page: Page) => page.getByRole("dialog");

let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

const mobileContext = (
  browser: Browser,
  viewport: { width: number; height: number },
) =>
  browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    storageState,
  });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 664 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/i/hoshizora");
  await page.getByRole("button", { name: "ログイン", exact: true }).tap();
  await dialog(page).getByLabel("ユーザー名").fill(username);
  await dialog(page).getByLabel("パスワード").fill(password);
  await dialog(page).getByRole("button", { name: "登録する" }).tap();
  await expect(
    dialog(page).getByRole("heading", { name: "推しを選ぶ" }),
  ).toBeVisible();
  await dialog(page).getByLabel("表示名").fill("スマホE2Eさん");
  await dialog(page).getByRole("button", { name: "保存" }).tap();
  await expect(dialog(page)).toHaveCount(0);
  storageState = await context.storageState();
  await context.close();
});

/** 要素のうち、画面内に見えている高さ */
const visibleHeight = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  });

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}×${viewport.height} でログイン後も投稿を読み、いいね・返信・追加読み込みができる`, async ({
    browser,
  }) => {
    const context = await mobileContext(browser, viewport);
    const page = await context.newPage();
    await page.goto("/i/hoshizora");
    await expect(
      page.getByRole("textbox", { name: "投稿の本文" }),
    ).toBeVisible();

    // 横にはみ出さず、一覧だけが別にスクロールする領域にならない
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByTestId("timeline")).toHaveCSS(
      "overflow-y",
      "visible",
    );

    // 一覧までスクロールすると、投稿本文が画面の大部分に表示される
    const card = page.getByTestId("post-card").first();
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
    expect(await visibleHeight(page, "timeline")).toBeGreaterThan(
      viewport.height * 0.5,
    );

    // いいねをタップして、取り消す
    const like = card.getByRole("button", { name: "いいね", exact: true });
    await like.tap();
    const unlike = card.getByRole("button", { name: "いいねを取り消す" });
    await expect(unlike).toBeVisible();
    await unlike.tap();
    await expect(like).toBeVisible();

    // 返信フォームを開ける
    await card.getByRole("button", { name: "返信を表示" }).tap();
    await expect(
      card.getByRole("textbox", { name: "返信の本文" }),
    ).toBeVisible();

    // ページの下端までスクロールすると、続きを読み込む
    const cards = page.getByTestId("post-card");
    const before = await cards.count();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect.poll(() => cards.count()).toBeGreaterThan(before);

    await context.close();
  });
}

test("375×548 で投稿フォームの送信ボタンをタップして投稿できる", async ({
  browser,
}) => {
  const context = await mobileContext(browser, { width: 375, height: 548 });
  const page = await context.newPage();
  await page.goto("/i/hoshizora");
  const body = `スマホE2E ${Date.now()}`;
  const card = page.getByTestId("post-card").filter({ hasText: body });
  try {
    await page.getByRole("textbox", { name: "投稿の本文" }).fill(body);
    const submit = page.getByRole("button", { name: "投稿", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await submit.tap();
    await expect(card).toBeVisible();
  } finally {
    if (await card.count()) {
      page.once("dialog", (d) => d.accept());
      await card.getByRole("button", { name: "削除" }).tap();
      await expect(card).toHaveCount(0);
    }
    await context.close();
  }
});
