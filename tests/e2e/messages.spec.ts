import { expect, type Page, type Request, test } from "@playwright/test";

declare global {
  interface Window {
    dmSoundPlays: number;
  }
}

const suffix = Date.now().toString(36);
const names = {
  a: `e2e_dm_${suffix}_a`,
  b: `e2e_dm_${suffix}_b`,
  c: `e2e_dm_${suffix}_c`,
  sender: `e2e_dm_${suffix}_s`,
  receiver: `e2e_dm_${suffix}_r`,
};
const password = "e2e-password";

async function register(page: Page, username: string, displayName: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ユーザー名").fill(username);
  await dialog.getByLabel("パスワード").fill(password);
  await dialog.getByRole("button", { name: "登録する" }).click();
  await expect(dialog.getByLabel("表示名")).toBeVisible();
  await dialog.getByLabel("表示名").fill(displayName);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toHaveCount(0);
}

/** 実際の送信が使ったServer Actionを別セッションから呼び、UIを迂回しても認可されるか確認する。 */
async function replay(page: Page, request: Request, data: unknown) {
  return page.request.post(request.url(), {
    headers: {
      "Next-Action": request.headers()["next-action"] ?? "",
      "Content-Type":
        request.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      Origin: new URL(request.url()).origin,
    },
    data: JSON.stringify(data),
  });
}

test("新着DMのバッジ・自動更新・添付音源の再生とミュート", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [sender, receiver] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  if (!sender || !receiver) throw new Error("page missing");
  try {
    await receiver.addInitScript(() => {
      const state = window as Window & { dmSoundPlays: number };
      state.dmSoundPlays = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        state.dmSoundPlays += 1;
        return start.apply(this, args);
      };
    });
    await register(sender, names.sender, "通知の送信者");
    await register(receiver, names.receiver, "通知の受信者");
    const baseline = receiver.waitForResponse(
      (response) =>
        response.url().endsWith("/api/messages/notifications") &&
        response.status() === 200,
    );
    await receiver.goto("/messages");
    await baseline;
    await expect(
      receiver.getByText("まだメッセージはありません", { exact: true }),
    ).toBeVisible();
    await receiver.getByRole("button", { name: "通知音を有効にする" }).click();
    await expect(
      receiver.getByRole("button", { name: "通知音をオフにする" }),
    ).toBeVisible();
    expect(
      await receiver.evaluate(
        () => (window as Window & { dmSoundPlays: number }).dmSoundPlays,
      ),
    ).toBe(0);
    const audio = await receiver.request.get("/sounds/dm-notification.mp3");
    expect(audio.ok()).toBe(true);
    expect(audio.headers()["content-type"]).toContain("audio/mpeg");

    await sender.goto(`/u/${names.receiver}`);
    await sender
      .getByRole("button", { name: "メッセージ", exact: true })
      .click();
    const send = async (body: string) => {
      await sender
        .getByRole("textbox", { name: "メッセージの本文" })
        .fill(body);
      await sender.getByRole("button", { name: "送信", exact: true }).click();
      await expect(
        sender.getByTestId("message-item").filter({ hasText: body }),
      ).toBeVisible();
    };
    await send("自動通知の一通目");
    await expect(
      receiver
        .getByTestId("messages-unread-badge")
        .locator('[aria-hidden="true"]'),
    ).toHaveText("1", { timeout: 15_000 });
    await expect(
      receiver
        .getByRole("list", { name: "会話", exact: true })
        .getByText("自動通知の一通目"),
    ).toBeVisible();
    await expect
      .poll(() =>
        receiver.evaluate(
          () => (window as Window & { dmSoundPlays: number }).dmSoundPlays,
        ),
      )
      .toBe(1);
    await receiver
      .getByRole("list", { name: "会話", exact: true })
      .getByRole("link")
      .click();
    await expect(receiver.getByTestId("messages-unread-badge")).toHaveCount(0);

    await send("会話中も更新ボタンなしで表示");
    await expect(
      receiver
        .getByTestId("message-item")
        .filter({ hasText: "会話中も更新ボタンなしで表示" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        receiver.evaluate(
          () => (window as Window & { dmSoundPlays: number }).dmSoundPlays,
        ),
      )
      .toBe(2);
    await expect(receiver.getByTestId("messages-unread-badge")).toHaveCount(0);
    await receiver.getByRole("button", { name: "通知音をオフにする" }).click();
    await send("ミュート中も届く");
    await expect(
      receiver
        .getByTestId("message-item")
        .filter({ hasText: "ミュート中も届く" }),
    ).toBeVisible({ timeout: 15_000 });
    expect(
      await receiver.evaluate(
        () => (window as Window & { dmSoundPlays: number }).dmSoundPlays,
      ),
    ).toBe(2);
    await receiver.getByRole("button", { name: "通知音を有効にする" }).click();
    await expect(
      receiver.getByRole("button", { name: "通知音をオフにする" }),
    ).toBeVisible();
    await send("再び通知音が鳴る");
    await expect(
      receiver
        .getByTestId("message-item")
        .filter({ hasText: "再び通知音が鳴る" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        receiver.evaluate(
          () => (window as Window & { dmSoundPlays: number }).dmSoundPlays,
        ),
      )
      .toBe(3);
    expect(
      (await sender.request.get("/api/messages/notifications")).headers()[
        "cache-control"
      ],
    ).toBe("private, no-store");
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get(
            `${new URL(sender.url()).origin}/api/messages/notifications`,
          )
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("DMを送受信でき、第三者・未ログインへの漏洩を防ぐ", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  const [a, b, stranger, anon] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  if (!a || !b || !stranger || !anon) throw new Error("page missing");
  try {
    await register(a, names.a, "DM送信者");
    await register(b, names.b, "DM受信者");
    await register(stranger, names.c, "DM第三者");

    await a.goto(`/u/${names.a}`);
    await expect(
      a.getByRole("button", { name: "メッセージ", exact: true }),
    ).toHaveCount(0);
    await anon.goto(`/u/${names.b}`);
    await anon.getByRole("button", { name: "メッセージ", exact: true }).click();
    await expect(
      anon.getByRole("dialog").getByText("DMを送るにはアカウントが必要です"),
    ).toBeVisible();
    await anon.getByRole("button", { name: "閉じる", exact: true }).click();

    await a.goto(`/u/${names.b}`);
    await a.getByRole("button", { name: "メッセージ", exact: true }).click();
    await expect(a).toHaveURL(/\/messages\/[\da-f-]+$/);
    const conversationUrl = a.url();
    const conversationId = new URL(conversationUrl).pathname.split("/").pop();
    await expect(
      a.getByText(
        "まだメッセージはありません。最初のメッセージを送ってみましょう。",
      ),
    ).toBeVisible();
    // 空の会話は受信側の一覧に表示しない。
    expect(
      (await (await b.request.get("/api/messages")).json()).conversations,
    ).toEqual([]);

    const secret = `待ち合わせ ${suffix} #秘密`;
    await a.getByRole("textbox", { name: "メッセージの本文" }).fill(secret);
    const sent = a.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        Boolean(request.headers()["next-action"]) &&
        Boolean(request.postData()?.includes(secret)),
    );
    await a.getByRole("button", { name: "送信", exact: true }).click();
    const actionRequest = await sent;
    await expect(
      a.getByTestId("message-item").filter({ hasText: secret }),
    ).toBeVisible();

    await b.getByRole("link", { name: "メッセージ一覧", exact: true }).click();
    await b
      .getByRole("list", { name: "会話", exact: true })
      .getByRole("link", { name: /DM送信者/ })
      .click();
    await expect(b).toHaveURL(conversationUrl);
    await expect(
      b.getByTestId("message-item").filter({ hasText: secret }),
    ).toBeVisible();
    const reply = `了解 ${suffix}`;
    await b.getByRole("textbox", { name: "メッセージの本文" }).fill(reply);
    await b.getByRole("button", { name: "送信", exact: true }).click();
    await expect(
      b.getByTestId("message-item").filter({ hasText: reply }),
    ).toBeVisible();
    await a.getByRole("button", { name: "更新", exact: true }).click();
    await expect(
      a.getByTestId("message-item").filter({ hasText: reply }),
    ).toBeVisible();
    await a.reload();
    await expect(a.getByTestId("message-item")).toHaveCount(2);
    await a.goto(`/u/${names.b}`);
    await a.getByRole("button", { name: "メッセージ", exact: true }).click();
    await expect(a).toHaveURL(conversationUrl);

    // 公開タイムライン・プロフィールには本文が出ない。
    expect(
      await (await anon.request.get("/api/timeline")).text(),
    ).not.toContain(secret);
    expect(
      await (await anon.request.get(`/u/${names.a}`)).text(),
    ).not.toContain(secret);
    const strangerList = await stranger.request.get("/api/messages");
    expect((await strangerList.json()).conversations).toEqual([]);
    const forbidden = await stranger.request.get(
      `/api/messages/${conversationId}`,
    );
    expect(forbidden.status()).toBe(404);
    expect(forbidden.headers()["cache-control"]).toContain("no-store");
    expect(await forbidden.text()).not.toContain(secret);
    const missing = await stranger.request.get(
      "/api/messages/00000000-0000-4000-8000-000000000000",
    );
    expect(await missing.text()).toBe(await forbidden.text());
    const deniedSend = await replay(stranger, actionRequest, [
      { conversationId, body: "第三者からの送信" },
    ]);
    expect(await deniedSend.text()).toContain("conversation_not_found");
    const anonSend = await replay(anon, actionRequest, [
      { conversationId, body: "未ログイン送信" },
    ]);
    expect(await anonSend.text()).toContain("unauthorized");
    expect(
      (await anon.request.get(`/api/messages/${conversationId}`)).status(),
    ).toBe(401);
    expect((await anon.request.get("/api/messages")).status()).toBe(401);
    await stranger.goto(conversationUrl);
    await expect(stranger.getByTestId("message-item")).toHaveCount(0);
    await expect(
      stranger.getByRole("textbox", { name: "メッセージの本文" }),
    ).toHaveCount(0);

    // 送信者IDを付け足しても無視され、セッションの本人が送信者になる。
    const forged = await replay(a, actionRequest, [
      {
        conversationId,
        body: "本人として送信",
        senderId: "00000000-0000-4000-8000-000000000000",
      },
    ]);
    expect(await forged.text()).toContain('"ok":true');
    const historyResponse = await a.request.get(
      `/api/messages/${conversationId}`,
    );
    const history = await historyResponse.json();
    expect(
      history.messages.find(
        (message: { body: string }) => message.body === "本人として送信",
      ).senderId,
    ).toBe(history.viewerId);
    expect(historyResponse.headers()["cache-control"]).toBe(
      "private, no-store",
    );

    // 同じ会話を更新しながら、UIで過去の履歴を追加取得する。
    for (let i = 0; i < 21; i++) {
      const response = await replay(a, actionRequest, [
        { conversationId, body: `履歴${String(i).padStart(2, "0")}` },
      ]);
      expect(response.ok()).toBe(true);
    }
    await a.reload();
    await expect(a.getByTestId("message-item")).toHaveCount(20);
    await a.getByRole("button", { name: "過去のメッセージを表示" }).click();
    await expect(a.getByTestId("message-item")).toHaveCount(24);
    await expect(
      a.getByTestId("message-item").filter({ hasText: secret }),
    ).toBeVisible();

    // PC・スマートフォン、cool・kawaiiのどちらでもフォームを操作できる。
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await a.setViewportSize(viewport);
      for (const design of ["cool", "kawaii"]) {
        await a
          .getByRole("button", {
            name: design === "cool" ? "かっこいい" : "かわいい",
          })
          .click();
        await expect(a.locator("html")).toHaveAttribute("data-design", design);
        await expect(
          a.getByRole("textbox", { name: "メッセージの本文" }),
        ).toBeVisible();
        expect(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await a.screenshot({
          path: `test-results/dm-${viewport.width}-${design}.png`,
        });
      }
    }

    await a.getByRole("button", { name: "アカウントメニュー" }).click();
    await a.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(
      a.getByRole("button", { name: "ログイン", exact: true }),
    ).toBeVisible();
    await expect(a.getByTestId("message-item")).toHaveCount(0);
    expect(
      (await a.request.get(`/api/messages/${conversationId}`)).status(),
    ).toBe(401);
    // 同じタブを別アカウントで使い、戻る操作をしても古いDMが表示されない。
    await a.getByRole("button", { name: "ログイン", exact: true }).click();
    const dialog = a.getByRole("dialog");
    await dialog.getByRole("tab", { name: "ログイン" }).click();
    await dialog.getByLabel("ユーザー名").fill(names.c);
    await dialog.getByLabel("パスワード").fill(password);
    await dialog.getByRole("button", { name: "ログインする" }).click();
    await expect(dialog).toHaveCount(0);
    await a.goto("/messages");
    await expect(
      a.getByText("まだメッセージはありません", { exact: true }),
    ).toBeVisible();
    await a.goBack();
    await expect(a.getByTestId("message-item")).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
