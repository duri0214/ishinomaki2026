import { expect, type Page, test } from "@playwright/test";

const map = (page: Page) => page.getByTestId("map");
const cards = (page: Page) => page.getByTestId("post-card");

test.describe("閲覧", () => {
  test("世界 → 島 → 家 → 絞り込み → 戻る", async ({ page }) => {
    await page.goto("/");
    await expect(map(page)).toHaveAttribute("data-focus", "world");
    await expect(cards(page).first()).toBeVisible();
    // 全島タイムラインの投稿には、島名のバッジが付く
    await expect(
      cards(page)
        .first()
        .getByRole("link", { name: /^(ARASHI|TWICE|M!LK|FRUITSZIPPER)$/ }),
    ).toBeVisible();

    // 島をクリック → 島へズーム
    await page.getByTestId("island-hoshizora").click();
    await expect(page).toHaveURL(/\/i\/hoshizora$/);
    await expect(map(page)).toHaveAttribute("data-focus", "island:hoshizora");
    await expect(
      page.getByRole("link", { name: "ARASHI" }).first(),
    ).toBeVisible();

    // 中央の広場にメンバー5人のアイコン、まわりに話題タグの家10軒
    await expect(page.locator("[data-member]")).toHaveCount(5);
    const houses = page.locator(
      '[data-testid^="house-"][aria-label*="、直近7日で"]',
    );
    await expect(houses).toHaveCount(10);
    // メンバーのアイコンにホバーすると、#名前 の札が出る
    await page.getByTestId("house-櫻井翔").hover();
    await expect(page.getByTestId("member-label-櫻井翔")).toBeVisible();
    // 家（話題タグ）をクリック → 家へズーム
    const first = houses.first();
    const label = (await first.getAttribute("aria-label")) ?? "";
    const tagName = label.match(/^#([^、]+)、/)?.[1] ?? "";
    expect(tagName).not.toBe("");
    await first.click();
    await expect(page).toHaveURL(/\/i\/hoshizora\/t\//);
    await expect(map(page)).toHaveAttribute("data-focus", /^house:hoshizora:/);
    await expect(
      page.getByRole("navigation", { name: "現在地" }),
    ).toContainText(`#${tagName}`);

    // タイムラインはそのタグの投稿だけ
    await expect(cards(page).first()).toBeVisible();
    const texts = await cards(page).allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.toLowerCase()).toContain(`#${tagName}`.toLowerCase());
    }

    // 戻る → 島、もう一度戻る → 世界。マップは作り直されず、フォーカスだけが戻る
    await page.goBack();
    await expect(map(page)).toHaveAttribute("data-focus", "island:hoshizora");
    await expect(page).toHaveURL(/\/i\/hoshizora$/);
    await page.goBack();
    await expect(map(page)).toHaveAttribute("data-focus", "world");
    await expect(page).toHaveURL(/\/$/);
  });

  test("ページ遷移してもマップのDOMは再マウントされない", async ({ page }) => {
    await page.goto("/");
    await map(page).evaluate((el) => {
      (el as HTMLElement & { __mounted?: string }).__mounted = "same-node";
    });
    await page.getByTestId("island-shiokaze").click();
    await expect(page).toHaveURL(/\/i\/shiokaze$/);
    await expect(map(page)).toHaveAttribute("data-focus", "island:shiokaze");
    const marker = await map(page).evaluate(
      (el) => (el as HTMLElement & { __mounted?: string }).__mounted,
    );
    expect(marker).toBe("same-node");
  });

  test("日本語のタグURLを直接開くと、その家にズームして絞り込まれる", async ({
    page,
  }) => {
    await page.goto("/i/hoshizora/t/自己紹介");
    await expect(map(page)).toHaveAttribute(
      "data-focus",
      "house:hoshizora:自己紹介",
    );
    await expect(
      page.getByRole("navigation", { name: "現在地" }),
    ).toContainText("#自己紹介");
    await expect(cards(page).first()).toContainText("#自己紹介");
    await expect(page).toHaveTitle(/#自己紹介 - ARASHI/);
  });

  test("タグ検索から、上位20件以外のタグも開ける（島はズームしない）", async ({
    page,
  }) => {
    await page.goto("/i/hoshizora");
    await page.getByRole("searchbox", { name: "タグを検索" }).fill("ライブ");
    const suggestions = page.getByRole("list", { name: "タグの候補" });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole("button").first().click();
    await expect(page).toHaveURL(/\/i\/hoshizora\/t\//);

    // まだ誰も使っていないタグも、空き区画に家を建ててその家へ寄る（投稿0件で開く）
    await page.goto("/i/hoshizora/t/zzz-unused-tag");
    await expect(map(page)).toHaveAttribute(
      "data-focus",
      "house:hoshizora:zzz-unused-tag",
    );
    await expect(
      page.getByText("#zzz-unused-tag の投稿はまだありません"),
    ).toBeVisible();
  });

  test("本文中のタグをクリックすると、そのタグのタイムラインになる", async ({
    page,
  }) => {
    await page.goto("/i/hoshizora");
    const tagLink = cards(page).first().locator('a[href*="/t/"]').first();
    const href = await tagLink.getAttribute("href");
    await tagLink.click();
    await expect(page).toHaveURL(
      new RegExp(`${href?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    );
  });

  test("スクロールすると続きが読み込まれる", async ({ page }) => {
    await page.goto("/i/hoshizora");
    await expect(cards(page)).toHaveCount(20);
    const timeline = page.getByTestId("timeline");
    await timeline.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(() => cards(page).count()).toBeGreaterThan(20);
  });

  test("存在しない島は見つからないページを表示し、マップは残る", async ({
    page,
  }) => {
    // loading.tsx でストリーミングするため、ステータスは200のまま（noindex が付く）
    await page.goto("/i/no-such-island");
    await expect(page.getByText("見つかりませんでした")).toBeVisible();
    await expect(map(page)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "世界地図へ戻る" }),
    ).toBeVisible();
  });
});
