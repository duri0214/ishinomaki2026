import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width}px: 登録済みの名前・説明を表示し、閉じた後も投稿一覧とマップを維持する`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/i/hoshizora");
    const map = page.getByTestId("map");
    const timeline = page.getByTestId("timeline");
    await expect(page.getByTestId("post-card").first()).toBeVisible();
    await expect(map).toHaveAttribute("data-focus", "island:hoshizora");
    await map.evaluate((element) => {
      element.setAttribute("data-artist-test", "same-node");
    });
    const scrollTop = await timeline.evaluate((element) => {
      element.scrollTop = 30;
      return element.scrollTop;
    });
    const url = page.url();
    const response = await page.request.get("/api/artists/hoshizora");
    expect(response.ok()).toBe(true);
    const { profile } = await response.json();

    const trigger = page.getByRole("button", {
      name: "星空シアター島のプロフィールを表示",
    });
    if (viewport.width <= 550) {
      await trigger.click();
    } else {
      await trigger.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    const dialog = page.getByRole("dialog", { name: "アーティスト詳細" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: profile.name, exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText(profile.description, { exact: true }),
    ).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds?.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width <= 550) expect(bounds?.width).toBe(viewport.width);
    await page.screenshot({
      path: test.info().outputPath("artist-details.png"),
    });

    // ネイティブdialogによってフォーカスが背景へ抜けない。
    await expect(
      dialog.getByRole("button", { name: "アーティスト詳細を閉じる" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(page.url()).toBe(url);
    await expect(map).toHaveAttribute("data-artist-test", "same-node");
    await expect(map).toHaveAttribute("data-focus", "island:hoshizora");
    expect(await timeline.evaluate((element) => element.scrollTop)).toBe(
      scrollTop,
    );
  });
}

test("世界とメンバー・話題タグのページにはプロフィールボタンを出さない", async ({
  page,
}) => {
  for (const path of ["/", "/i/hoshizora/t/みさき", "/i/hoshizora/t/ライブ"]) {
    await page.goto(path);
    await expect(page.getByTestId("post-card").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /のプロフィールを表示$/ }),
    ).toHaveCount(0);
  }
});

test("取得失敗から再試行でき、説明未登録と写真の欠落にも対応する", async ({
  page,
}) => {
  let failing = true;
  await page.route("**/api/artists/hoshizora", async (route) => {
    await route.fulfill(
      failing
        ? { status: 503, json: { error: "取得失敗" } }
        : {
            json: { profile: { name: "星空シアター", description: null } },
          },
    );
  });
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/i/hoshizora");
  await page
    .getByRole("button", { name: "星空シアター島のプロフィールを表示" })
    .click();
  const dialog = page.getByRole("dialog", { name: "アーティスト詳細" });
  await expect(dialog.getByRole("alert")).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: "もう一度試す" }).click();
  await expect(
    dialog.getByText("プロフィールはまだ登録されていません。"),
  ).toBeVisible();
  await expect(dialog.locator("img")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "アーティスト詳細を閉じる" })
    .click();
  await expect(dialog).toHaveCount(0);
});

test("島を切り替えると対応するプロフィールを取得する", async ({ page }) => {
  await page.goto("/i/hoshizora");
  await page
    .getByRole("button", { name: "星空シアター島のプロフィールを表示" })
    .click();
  const dialog = page.getByRole("dialog", { name: "アーティスト詳細" });
  await expect(
    dialog.getByRole("heading", { name: "星空シアター島", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: "潮風ガールズ島", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "潮風ガールズ島のプロフィールを表示" })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "潮風ガールズ島", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("架空のアイドルグループ「潮風ガールズ」のファンの島"),
  ).toBeVisible();
  await expect(
    dialog.getByText("架空のアイドルグループ「星空シアター」のファンの島"),
  ).toHaveCount(0);
});
