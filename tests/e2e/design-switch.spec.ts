import { expect, test } from "@playwright/test";
import { DESIGN_STORAGE_KEY } from "../../src/features/design/design";

test("切り替えを保存し、ページ移動と再読み込み後も復元する", async ({
  page,
}) => {
  await page.goto("/");
  const control = page.getByRole("switch", { name: "かわいいデザイン" });
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DESIGN_STORAGE_KEY),
  ).toBe("cool");

  await page.getByTestId("island-hoshizora").click();
  await expect(page).toHaveURL(/\/i\/hoshizora$/);
  await expect(control).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");

  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-design", "kawaii");
});

test("切り替えてもURL・マップのDOM・カメラ位置・スクロール位置を維持する", async ({
  page,
}) => {
  await page.goto("/i/hoshizora/t/自己紹介");
  const map = page.getByTestId("map");
  const timeline = page.getByTestId("timeline");
  await expect(map).toHaveAttribute("data-focus", "house:hoshizora:自己紹介");
  await expect(page.getByTestId("post-card").first()).toBeVisible();

  const url = page.url();
  const camera = await map.locator("svg > g").getAttribute("transform");
  await map.evaluate((element) => {
    (element as HTMLElement & { __designMarker?: boolean }).__designMarker =
      true;
  });
  const scrollTop = await timeline.evaluate((element) => {
    element.scrollTop = 30;
    return element.scrollTop;
  });

  await page.getByRole("switch", { name: "かわいいデザイン" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");
  expect(page.url()).toBe(url);
  expect(
    await map.evaluate(
      (element) =>
        (element as HTMLElement & { __designMarker?: boolean }).__designMarker,
    ),
  ).toBe(true);
  expect(await map.locator("svg > g").getAttribute("transform")).toBe(camera);
  expect(await timeline.evaluate((element) => element.scrollTop)).toBe(
    scrollTop,
  );
});

test("保存済みの値が不正な場合は既定の選択で起動する", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "invalid"),
    DESIGN_STORAGE_KEY,
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-design", "kawaii");
  await expect(
    page.getByRole("switch", { name: "かわいいデザイン" }),
  ).toHaveAttribute("aria-checked", "true");
});
