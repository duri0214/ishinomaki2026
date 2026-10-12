// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GroupPhoto, type PhotoIsland } from "@/features/layout/GroupPhoto";
import { Composer } from "@/features/posts/Composer";

const route = vi.hoisted(() => ({
  island: undefined as string | undefined,
  tag: undefined as string | undefined,
}));
vi.mock("next/navigation", () => ({
  useParams: () => route,
  usePathname: () => "/i/hoshizora",
}));
vi.mock("@/features/auth/AuthDialog", () => ({
  useAuthDialog: () => vi.fn(),
}));
vi.mock("@/features/auth/viewer", () => ({
  useViewer: () => ({ signedIn: true, user: null }),
}));
vi.mock("@/features/posts/actions", () => ({ createPostAction: vi.fn() }));

const photoIslands: PhotoIsland[] = [
  { slug: "hoshizora", name: "星空シアター島", tags: [] },
  { slug: "shiokaze", name: "潮風ガールズ島", tags: [] },
];
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];

beforeAll(() => {
  // jsdomにはネイティブdialogの開閉処理がない。フォーカストラップはブラウザのE2Eで検証する。
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});

beforeEach(() => {
  route.island = "hoshizora";
  route.tag = undefined;
  fetchMock.mockReset().mockImplementation(async () =>
    Response.json({
      profile: { name: "星空シアター", description: "1行目\n2行目" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.unstubAllGlobals();
});

function setup(withComposer = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const content = () => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <GroupPhoto islands={photoIslands} />
        {withComposer && <Composer islandSlug="hoshizora" />}
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(content());
  return {
    user: userEvent.setup(),
    ...view,
    rerenderRoute: () => view.rerender(content()),
  };
}

async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "星空シアター島のプロフィールを表示" }),
  );
}

describe("アーティストプロフィールの表示ボタン", () => {
  it("詳細を開閉しても投稿フォームの入力内容を維持する", async () => {
    const { user } = setup(true);
    const textbox = screen.getByRole("textbox", {
      name: "投稿の本文",
    }) as HTMLTextAreaElement;
    await user.type(textbox, "書きかけの投稿です");
    await openDetails(user);
    await user.click(
      screen.getByRole("button", { name: "アーティスト詳細を閉じる" }),
    );
    expect(screen.getByRole("textbox", { name: "投稿の本文" })).toBe(textbox);
    expect(textbox.value).toBe("書きかけの投稿です");
  });
  it("世界・メンバー・話題タグの投稿一覧には入口を表示しない", () => {
    route.island = undefined;
    const view = setup();
    expect(
      screen.queryByRole("button", { name: /のプロフィールを表示$/ }),
    ).toBeNull();
    route.island = "hoshizora";
    for (const tag of ["みさき", "ライブ"]) {
      route.tag = tag;
      view.rerenderRoute();
      expect(
        screen.queryByRole("button", { name: /のプロフィールを表示$/ }),
      ).toBeNull();
    }
  });

  it("一度押すとメニューを挟まず、DBの名前と改行入りの説明を表示する", async () => {
    const { user } = setup();
    expect(fetchMock).not.toHaveBeenCalled();
    await openDetails(user);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "星空シアター" }),
    ).toBeDefined();
    expect(screen.getByText("1行目 2行目").textContent).toBe("1行目\n2行目");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/artists/hoshizora");
  });

  it("EnterとSpaceでも直接プロフィールを開く", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", {
      name: "星空シアター島のプロフィールを表示",
    });
    trigger.focus();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    for (const key of ["{Enter}", " "]) {
      await user.keyboard(key);
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      await user.click(
        screen.getByRole("button", { name: "アーティスト詳細を閉じる" }),
      );
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("詳細の閉じるボタン・Escapeで閉じ、入口にフォーカスを戻す", async () => {
    const { user } = setup();
    await openDetails(user);
    await user.click(
      screen.getByRole("button", { name: "アーティスト詳細を閉じる" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "星空シアター島のプロフィールを表示",
      }),
    );
    await openDetails(user);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("説明が空なら未登録の案内を表示する", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        profile: { name: "星空シアター", description: "  \n " },
      }),
    );
    const { user } = setup();
    await openDetails(user);
    expect(
      await screen.findByText("プロフィールはまだ登録されていません。"),
    ).toBeDefined();
  });

  it("取得中と失敗時を表示し、再試行できる", async () => {
    let complete: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { user } = setup();
    await openDetails(user);
    expect(screen.getByRole("status").textContent).toBe(
      "プロフィールを読み込み中…",
    );
    await act(async () => complete(new Response(null, { status: 503 })));
    expect(await screen.findByRole("alert")).toBeDefined();
    fetchMock.mockImplementation(async () =>
      Response.json({
        profile: { name: "星空シアター", description: "1行目\n2行目" },
      }),
    );
    await user.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(
      await screen.findByRole("heading", { name: "星空シアター" }),
    ).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("別の島に切り替えた後に、遅れて届いた前のプロフィールを表示しない", async () => {
    let complete: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = setup();
    await openDetails(view.user);
    route.island = "shiokaze";
    view.rerenderRoute();
    expect(screen.queryByRole("dialog")).toBeNull();
    fetchMock.mockImplementation(async () =>
      Response.json({
        profile: { name: "潮風ガールズ", description: "潮風の説明" },
      }),
    );
    await view.user.click(
      screen.getByRole("button", {
        name: "潮風ガールズ島のプロフィールを表示",
      }),
    );
    await act(async () =>
      complete(
        Response.json({
          profile: { name: "前のアーティスト", description: "前の説明" },
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "潮風ガールズ" }),
      ).toBeDefined(),
    );
    expect(screen.queryByText("前の説明")).toBeNull();
  });
});
