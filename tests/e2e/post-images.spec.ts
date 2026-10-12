import { expect, test } from "@playwright/test";
import sharp from "sharp";

for (const device of ["desktop", "phone", "tablet"] as const) {
  test(`${device}: 端末に合った選択方法で画像付き投稿・返信ができる`, async ({
    page,
  }) => {
    if (device !== "desktop") {
      await page.addInitScript((device) => {
        Object.defineProperty(navigator, "userAgent", {
          get: () =>
            device === "phone"
              ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
              : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        });
        Object.defineProperty(navigator, "platform", {
          get: () => (device === "tablet" ? "MacIntel" : "iPhone"),
        });
        Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
      }, device);
    }
    await page.goto("/i/hoshizora");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    const auth = page.getByRole("dialog");
    await auth
      .getByLabel("ユーザー名")
      .fill(`e2e_img_${Date.now().toString(36)}`);
    await auth.getByLabel("パスワード").fill("e2e-password");
    await auth.getByRole("button", { name: "登録する" }).click();
    await expect(
      auth.getByRole("heading", { name: "推しを選ぶ" }),
    ).toBeVisible();
    await auth.getByLabel("表示名").fill("画像E2Eさん");
    await auth.getByRole("checkbox", { name: "ARASHI" }).check();
    await auth.getByRole("button", { name: "櫻井翔" }).click();
    await auth.getByRole("button", { name: "保存" }).click();
    await expect(auth).toHaveCount(0);

    const png = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const upload = { name: "photo.png", mimeType: "image/png", buffer: png };
    await expect(
      page.getByRole("button", { name: "写真から選択", exact: true }),
    ).toBeHidden();
    await expect(page.getByTestId("post-text-counter")).toHaveText("0/280");
    if (device === "desktop") {
      await expect(
        page.getByText("写真をアップロード", { exact: false }),
      ).toHaveCount(0);
      const chooserPromise = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "ファイルからアップロード", exact: true })
        .click();
      await (await chooserPromise).setFiles(upload);
    } else {
      await expect(
        page.getByRole("button", {
          name: "ファイルからアップロード",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.getByText("写真をアップロード", { exact: false }).click();
      await expect(
        page.getByRole("button", { name: "写真から選択", exact: true }),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "投稿の本文" }).click();
      await expect(
        page.getByRole("button", { name: "写真から選択", exact: true }),
      ).toBeHidden();
      await page.getByText("写真をアップロード", { exact: false }).click();
      const chooserPromise = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "写真から選択", exact: true })
        .click();
      await (await chooserPromise).setFiles(upload);
      await expect(
        page.getByRole("button", { name: "写真から選択", exact: true }),
      ).toBeHidden();
    }
    await expect(page.getByAltText("添付予定: photo.png")).toBeVisible();
    await page.getByRole("button", { name: "画像1を外す" }).click();
    await expect(page.getByAltText("添付予定: photo.png")).toHaveCount(0);
    await page
      .getByLabel("ファイルを添付", { exact: true })
      .setInputFiles(upload);
    await page.getByRole("button", { name: "投稿", exact: true }).click();
    const card = page
      .getByTestId("post-card")
      .filter({ hasText: "画像E2Eさん" })
      .first();
    await expect(card.getByAltText("添付画像1", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        card
          .getByAltText("添付画像1", { exact: true })
          .evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await card.getByRole("button", { name: "画像1を拡大" }).click();
    await expect(
      page.getByRole("dialog", { name: "画像の拡大表示" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await card.getByRole("button", { name: "返信を表示" }).click();
    const dataTransfer = await page.evaluateHandle((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }),
      );
      return transfer;
    }, Array.from(png));
    await card.locator("form").dispatchEvent("dragover", { dataTransfer });
    await expect(card.getByTestId("image-drop-overlay")).toBeVisible();
    await card.locator("form").dispatchEvent("drop", { dataTransfer });
    await expect(card.getByTestId("image-drop-overlay")).toHaveCount(0);
    await expect(card.getByAltText("添付予定: drop.png")).toBeVisible();
    await card.getByRole("button", { name: "返信", exact: true }).click();
    await expect(
      card.getByTestId("reply-item").getByAltText("添付画像1", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await card.getByRole("button", { name: "返信を表示" }).click();
    await expect(
      card.getByTestId("reply-item").getByAltText("添付画像1", { exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "返信を削除" }).click();
    await expect(card.getByTestId("reply-item")).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "削除", exact: true }).click();
    await expect(
      page.getByTestId("post-card").filter({ hasText: "画像E2Eさん" }),
    ).toHaveCount(0);
  });
}

test("未ログインでは画像選択を表示しない", async ({ page }) => {
  await page.goto("/i/hoshizora");
  await expect(page.getByLabel("写真を添付", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("ファイルを添付", { exact: true })).toHaveCount(
    0,
  );
});
