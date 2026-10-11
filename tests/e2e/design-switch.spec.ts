import { expect, test } from "@playwright/test";
import { DESIGN_STORAGE_KEY } from "../../src/features/design/design";

test("切り替えを保存し、ページ移動と再読み込み後も復元する", async ({
  page,
}) => {
  await page.goto("/");
  const kawaii = page.getByRole("button", { name: "かわいい" });
  const cool = page.getByRole("button", { name: "かっこいい" });
  await expect(kawaii).toHaveAttribute("aria-pressed", "true");
  await cool.click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DESIGN_STORAGE_KEY),
  ).toBe("cool");

  await page.getByTestId("island-hoshizora").click();
  await expect(page).toHaveURL(/\/i\/hoshizora$/);
  await expect(kawaii).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(kawaii).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");

  await kawaii.focus();
  await page.keyboard.press("Space");
  await expect(kawaii).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-design", "kawaii");
});

test("切り替えてもURL・マップのDOM・カメラ位置・スクロール位置を維持する", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/i/hoshizora/t/自己紹介");
  const map = page.getByTestId("map");
  const timeline = page.getByTestId("timeline");
  await expect(map).toHaveAttribute("data-focus", "house:hoshizora:自己紹介");
  await expect(page.getByTestId("post-card").first()).toBeVisible();

  const scene = map.locator("svg > g");
  const scale = () =>
    scene.evaluate(
      (element) =>
        (element as SVGGElement).transform.baseVal.consolidate()?.matrix.a ?? 0,
    );
  // SSRの仮カメラを取得せず、計測後に拡大操作が反映されるまで待つ。
  // reducedMotionにより操作後のカメラ移動は即時に完了する。
  await expect(async () => {
    const before = await scale();
    expect(before).toBeGreaterThan(0);
    await map.getByRole("button", { name: "拡大", exact: true }).click();
    expect(await scale()).toBeCloseTo(before * 1.6, 6);
  }).toPass({ timeout: 15_000 });

  const zoomedCamera = await scene.getAttribute("transform");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("マップの表示領域を取得できません");
  await page.mouse.move(bounds.x + 40, bounds.y + 60);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 80, bounds.y + 90, { steps: 5 });
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute("transform", zoomedCamera ?? "");

  const url = page.url();
  const camera = await scene.getAttribute("transform");
  await map.evaluate((element) => {
    (element as HTMLElement & { __designMarker?: boolean }).__designMarker =
      true;
  });
  const scrollTop = await timeline.evaluate((element) => {
    element.scrollTop = 30;
    return element.scrollTop;
  });

  await page.getByRole("button", { name: "かっこいい" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "cool");
  expect(page.url()).toBe(url);
  expect(
    await map.evaluate(
      (element) =>
        (element as HTMLElement & { __designMarker?: boolean }).__designMarker,
    ),
  ).toBe(true);
  await expect(scene).toHaveAttribute("transform", camera ?? "");
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
    page.getByRole("button", { name: "かわいい" }),
  ).toHaveAttribute("aria-pressed", "true");
});
