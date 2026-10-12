import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

/**
 * 共通点のあるユーザー: 右側のタイムラインの「関連ユーザー」タブ。
 * 2人のユーザーが同じ推しメンバー・同じ公演を持つと、お互いに共通点のバッジつきで表示される。
 * 他の spec が推しにしていないグループ（TWICE）とメンバーを使い、結果が混ざらないようにする。
 * 使ったフォロー・推し・参戦記録は最後に消す（ユーザーは他の spec と同じく残る）。
 */
const suffix = Date.now().toString(36);
const partner = { username: `e2e_rel_p_${suffix}`, name: `相手${suffix}` };
const viewer = { username: `e2e_rel_v_${suffix}`, name: `自分${suffix}` };
const password = "e2e-password";
const ISLAND = { slug: "shiokaze", name: "TWICE" };
const MEMBERS = ["ナヨン", "ジョンヨン"];
const SIGN_IN_REASON = "共通点のあるユーザーを見るにはアカウントが必要です";

type Account = typeof partner;

const dialog = (page: Page) => page.getByRole("dialog");
const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const relatedPanel = (page: Page) => page.getByTestId("related-users");
const relatedCard = (page: Page, account: Account) =>
  page.getByTestId("related-user").filter({ hasText: account.name });

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

/**
 * 読み込み直後のページは、サーバーが描いた HTML に React がまだつながっておらず、押しても反応しない。
 * つながるのを待ってから押す。
 */
async function clickWhenHydrated(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
  await target.click();
}

/** 登録して、TWICEと2人のメンバーを推しにする */
async function register(page: Page, account: Account) {
  await page.goto("/");
  await clickWhenHydrated(
    page.getByRole("button", { name: "ログイン", exact: true }),
  );
  await dialog(page).getByLabel("ユーザー名").fill(account.username);
  await dialog(page).getByLabel("パスワード").fill(password);
  await dialog(page).getByRole("button", { name: "登録する" }).click();
  await expect(
    dialog(page).getByRole("heading", { name: "推しを選ぶ" }),
  ).toBeVisible();
  await dialog(page).getByLabel("表示名").fill(account.name);
  await dialog(page).getByRole("checkbox", { name: ISLAND.name }).check();
  for (const member of MEMBERS) {
    await dialog(page).getByRole("button", { name: member }).click();
  }
  await dialog(page).getByRole("button", { name: "保存" }).click();
  await expect(dialog(page)).toHaveCount(0);
}

/** ログイン中なら何もせず、そうでなければログインする */
async function ensureSignedIn(page: Page, account: Account) {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "アカウントメニュー" });
  if (await menu.isVisible()) return;
  await clickWhenHydrated(
    page.getByRole("button", { name: "ログイン", exact: true }),
  );
  await dialog(page).getByRole("tab", { name: "ログイン" }).click();
  await dialog(page).getByLabel("ユーザー名").fill(account.username);
  await dialog(page).getByLabel("パスワード").fill(password);
  await dialog(page).getByRole("button", { name: "ログインする" }).click();
  await expect(menu).toBeVisible();
}

/** アカウントメニューから自分のプロフィールへ移動する */
async function openProfile(page: Page) {
  await clickWhenHydrated(
    page.getByRole("button", { name: "アカウントメニュー" }),
  );
  await page.getByRole("menuitem", { name: "プロフィール" }).click();
  await expect(page.getByLabel("1. フォロー中のアイドル")).toBeVisible();
}

/** プロフィールの参戦記録で、TWICEの最初の公演を記録する */
async function attendFirstLive(page: Page) {
  await openProfile(page);
  await page.getByLabel("1. フォロー中のアイドル").selectOption(ISLAND.slug);
  await page.getByLabel("2. ライブを選択").selectOption({ index: 1 });
  await page.getByRole("button", { name: "参戦記録を保存" }).click();
  await expect(page.getByText("参戦記録を保存しました")).toBeVisible();
}

/** 関連ユーザーの一覧が出るのを待ち、「もっと見る」が出なくなるまで押して、取得済みの全員を表示する */
async function showAllRelated(page: Page) {
  await expect(page.getByTestId("related-user").first()).toBeVisible();
  const more = relatedPanel(page).getByRole("button", { name: "もっと見る" });
  while (await more.isVisible()) await more.click();
}

/** カードの共通点のバッジを、並んでいる順に種類で返す */
const kindsOf = (card: Locator) =>
  card
    .locator("[data-kind]")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.kind));

/** viewer が partner をフォローしていたら解除する */
async function unfollowPartner(page: Page) {
  await ensureSignedIn(page, viewer);
  await page.goto(`/u/${partner.username}`);
  const following = page.getByRole("button", {
    name: "フォロー中",
    exact: true,
  });
  if (await following.isVisible()) {
    await clickWhenHydrated(following);
    await expect(
      page.getByRole("button", { name: "フォロー", exact: true }),
    ).toBeVisible();
  }
}

/** 参戦記録をすべて消し、推しをすべて外す */
async function clearFavoritesAndRecords(page: Page, account: Account) {
  await ensureSignedIn(page, account);
  await openProfile(page);
  const edit = page.getByRole("button", { name: "記録を編集", exact: true });
  while (await edit.count()) {
    const before = await edit.count();
    await edit.first().click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(edit).toHaveCount(before - 1);
  }
  await page.getByRole("button", { name: "編集", exact: true }).click();
  const island = page.getByRole("checkbox", { name: ISLAND.name });
  if (await island.isChecked()) await island.uncheck();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("推しはまだ設定されていません")).toBeVisible();
}

test("未ログインで「関連ユーザー」を押すと、切り替わらずにログインを促される", async ({
  page,
}) => {
  await page.goto("/");
  await expect(tab(page, "投稿")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timeline")).toBeVisible();

  await clickWhenHydrated(tab(page, "関連ユーザー"));
  await expect(dialog(page).getByText(SIGN_IN_REASON)).toBeVisible();
  await dialog(page).getByRole("button", { name: "閉じる" }).click();
  await expect(tab(page, "投稿")).toHaveAttribute("aria-selected", "true");
  await expect(relatedPanel(page)).toHaveCount(0);
});

test("同じ推しメンバー・公演のユーザーが、共通点のバッジつきで関連ユーザーに出る", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const partnerPage = await newPage(browser);
  const page = await newPage(browser);
  try {
    await register(partnerPage, partner);
    await attendFirstLive(partnerPage);

    // 自分も同じグループ・メンバーを推しにする。まだ参戦記録はない
    await register(page, viewer);
    await expect(tab(page, "投稿")).toHaveAttribute("aria-selected", "true");
    await tab(page, "関連ユーザー").click();
    await expect(tab(page, "関連ユーザー")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // 「投稿」の中身は残したまま隠れる
    await expect(page.getByTestId("timeline")).toBeHidden();

    await showAllRelated(page);
    const card = relatedCard(page, partner);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("link", { name: partner.name }),
    ).toHaveAttribute("href", `/u/${partner.username}`);
    await expect(card.getByText(`@${partner.username}`)).toBeVisible();
    await expect(card.getByText("ナヨンを推しています")).toBeVisible();
    await expect(card.getByText("ジョンヨンを推しています")).toBeVisible();
    // 同じグループの推しは、メンバーの共通点に含まれるので別のバッジにしない
    await expect(card.getByText(`${ISLAND.name}を推しています`)).toHaveCount(0);
    await expect(card.getByText(/に参戦しています/)).toHaveCount(0);
    expect(await kindsOf(card)).toEqual(["member", "member"]);

    // 自分も同じ公演に参戦すると、ライブの共通点が加わる。
    // プロフィールへ移動して戻っても、選んでいるタブは保たれる
    await attendFirstLive(page);
    await page.getByRole("link", { name: "世界地図へ" }).click();
    await expect(tab(page, "関連ユーザー")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await showAllRelated(page);
    await expect(card.getByText(/に参戦しています/)).toBeVisible();
    // 優先順位の高い順（メンバー → ライブ）。3件以内なので「他N件」は出ない
    expect(await kindsOf(card)).toEqual(["member", "member", "live"]);
    await expect(card.getByText(/他\d+件/)).toHaveCount(0);

    // 島のページへ移動しても、選んでいるタブは保たれる
    await page.getByRole("link", { name: ISLAND.name }).first().click();
    await expect(page).toHaveURL(new RegExp(`/i/${ISLAND.slug}$`));
    await expect(tab(page, "関連ユーザー")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await showAllRelated(page);
    await expect(card).toBeVisible();

    // 「投稿」に戻すと、投稿フォームとタイムラインが従来どおり使える
    await tab(page, "投稿").click();
    await expect(
      page.getByRole("textbox", { name: "投稿の本文" }),
    ).toBeVisible();
    await expect(page.getByTestId("timeline")).toBeVisible();

    // フォローすると、カードのボタンが「フォロー中」に変わる。更新すると一覧から外れる
    await tab(page, "関連ユーザー").click();
    await showAllRelated(page);
    await card.getByRole("button", { name: "フォロー", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "フォロー中", exact: true }),
    ).toBeVisible();
    await relatedPanel(page).getByRole("button", { name: "↻ 更新" }).click();
    await expect(relatedCard(page, partner)).toHaveCount(0);

    // ログアウトすると「投稿」に戻り、前のユーザーの結果は画面に残らない
    await page.getByRole("button", { name: "アカウントメニュー" }).click();
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(
      page.getByRole("button", { name: "ログイン", exact: true }),
    ).toBeVisible();
    await expect(tab(page, "投稿")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(partner.name)).toHaveCount(0);
    await tab(page, "関連ユーザー").click();
    await expect(dialog(page).getByText(SIGN_IN_REASON)).toBeVisible();
  } finally {
    // 失敗しても、フォロー・推し・参戦記録を残さない
    try {
      await unfollowPartner(page);
      await clearFavoritesAndRecords(page, viewer);
    } catch (error) {
      console.warn(`後片付けに失敗しました (${viewer.username}):`, error);
    }
    try {
      await clearFavoritesAndRecords(partnerPage, partner);
    } catch (error) {
      console.warn(`後片付けに失敗しました (${partner.username}):`, error);
    }
  }
});
