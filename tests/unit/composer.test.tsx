// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action";

const viewer = { authEnabled: true, signedIn: true };
const createPostAction = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("@/features/auth/viewer", () => ({ useViewer: () => viewer }));
vi.mock("@/features/posts/actions", () => ({
  createPostAction: (...args: unknown[]) => createPostAction(...args),
}));

import { Composer } from "@/features/posts/Composer";

const tagResults = [
  { name: "ライブ", normalizedName: "ライブ", kind: "topic" },
  { name: "ライブ飯", normalizedName: "ライブ飯", kind: "topic" },
  { name: "ひなた", normalizedName: "ひなた", kind: "member" },
];

let client: QueryClient;
const fetchMock = vi.fn();

function renderComposer(props: { initialText?: string } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Composer islandSlug="hoshizora" {...props} />
    </QueryClientProvider>,
  );
}

const textbox = () =>
  screen.getByRole("textbox", { name: "投稿の本文" }) as HTMLTextAreaElement;

beforeEach(() => {
  viewer.signedIn = true;
  viewer.authEnabled = true;
  createPostAction.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ tags: tagResults }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Composer", () => {
  it("未ログインなら、フォームの代わりにログインへの案内を出す", () => {
    viewer.signedIn = false;
    renderComposer();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("link", { name: "ログイン" }).getAttribute("href"),
    ).toBe("/sign-in");
  });

  it("ログインが未設定なら、閲覧のみである旨を出す", () => {
    viewer.signedIn = false;
    viewer.authEnabled = false;
    renderComposer();
    expect(screen.getByText(/閲覧のみ/)).toBeTruthy();
  });

  it("文字数を数え、280文字を超えると投稿できない", async () => {
    const user = userEvent.setup();
    renderComposer();
    const submit = screen.getByRole("button", { name: "投稿" });
    expect((submit as HTMLButtonElement).disabled).toBe(true); // 空

    await user.click(textbox());
    await user.paste("あ".repeat(280));
    expect(screen.getByText("280/280")).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    await user.paste("あ");
    expect(screen.getByText("281/280")).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("# を打つと島内のタグを候補に出し、選ぶと入力中のタグを置き換える", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(textbox());
    await user.type(textbox(), "今日は #ラ");

    const option = await screen.findByRole("button", { name: /^#ライブ$/ });
    // 島の slug と、入力中の文字で検索する
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(
        urls.some(
          (u) => u.includes("island=hoshizora") && u.includes("q=%E3%83%A9"),
        ),
      ).toBe(true);
    });
    expect(screen.getByText("メンバー")).toBeTruthy();

    await user.click(option);
    expect(textbox().value).toBe("今日は #ライブ ");
    // 選んだあとは候補を閉じる（タグの後ろに空白があるので入力中ではない）
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "タグの候補" })).toBeNull(),
    );
  });

  it("矢印キーで候補を選び、Enterで確定できる（確定中のEnterは投稿しない）", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(textbox());
    await user.type(textbox(), "#");
    await screen.findByRole("button", { name: /^#ライブ$/ });

    await user.keyboard("{ArrowDown}{Enter}");
    expect(textbox().value).toBe("#ライブ飯 ");
    expect(createPostAction).not.toHaveBeenCalled();
  });

  it("# のない文では候補を出さない", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.type(textbox(), "こんにちは");
    expect(screen.queryByRole("list", { name: "タグの候補" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("投稿すると本文を送り、フォームを空に戻してタイムラインを取り直す", async () => {
    createPostAction.mockResolvedValueOnce({
      ok: true,
      data: { id: "p1" },
    } satisfies ActionResult<{ id: string }>);
    const user = userEvent.setup();
    renderComposer();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await user.click(textbox());
    await user.paste("はじめまして #自己紹介 ");
    await user.click(screen.getByRole("button", { name: "投稿" }));

    await waitFor(() => expect(createPostAction).toHaveBeenCalledTimes(1));
    expect(createPostAction).toHaveBeenCalledWith({
      islandSlug: "hoshizora",
      body: "はじめまして #自己紹介 ",
    });
    await waitFor(() => expect(textbox().value).toBe(""));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["timeline"] });
  });

  it("投稿に失敗したらメッセージを出し、入力した本文は残す", async () => {
    createPostAction.mockResolvedValueOnce({
      ok: false,
      code: "unauthorized",
      message: "ログインが必要です",
    } satisfies ActionResult<unknown>);
    const user = userEvent.setup();
    renderComposer();
    await user.click(textbox());
    await user.paste("消えないでね");
    await user.click(screen.getByRole("button", { name: "投稿" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "ログインが必要です",
    );
    expect(textbox().value).toBe("消えないでね");
  });

  it("通信が失敗しても、本文を残してメッセージを出す", async () => {
    createPostAction.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    renderComposer();
    await user.click(textbox());
    await user.paste("本文");
    await user.click(screen.getByRole("button", { name: "投稿" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(textbox().value).toBe("本文");
  });

  it("タグページでは ` #タグ名` が入力済みで、投稿後も同じ状態に戻る", async () => {
    createPostAction.mockResolvedValueOnce({
      ok: true,
      data: {},
    } satisfies ActionResult<unknown>);
    const user = userEvent.setup();
    renderComposer({ initialText: " #自己紹介" });
    expect(textbox().value).toBe(" #自己紹介");

    await user.click(textbox());
    await user.keyboard("{Control>}{Home}{/Control}");
    await user.keyboard("よろしく");
    expect(textbox().value).toBe("よろしく #自己紹介");
    await user.click(screen.getByRole("button", { name: "投稿" }));
    await waitFor(() => expect(textbox().value).toBe(" #自己紹介"));
  });

  it("二重に押しても、投稿は1回だけ送る", async () => {
    let resolve!: (v: ActionResult<unknown>) => void;
    createPostAction.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    renderComposer();
    await user.click(textbox());
    await user.paste("one");
    const submit = screen.getByRole("button", { name: "投稿" });
    await user.click(submit);
    await user.click(screen.getByRole("button", { name: "投稿中…" }));
    expect(createPostAction).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: {} });
  });
});
