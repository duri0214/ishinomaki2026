// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeCommon } from "@/features/related-users/CommonBadge";
import {
  RELATED_USERS_PAGE_SIZE,
  RELATED_USERS_SIGN_IN_REASON,
} from "@/features/related-users/constants";
import type { CommonPoint, RelatedUser } from "@/features/related-users/rank";
import {
  TimelineTabProvider,
  TimelineTabs,
} from "@/features/related-users/TimelineTabs";

const openAuth = vi.fn();
const viewer: {
  signedIn: boolean;
  user: { id: string; username: string; displayName: string } | null;
} = {
  signedIn: true,
  user: { id: "me", username: "me_user", displayName: "わたし" },
};

vi.mock("@/features/auth/AuthDialog", () => ({
  useAuthDialog: () => openAuth,
}));
vi.mock("@/features/auth/viewer", () => ({ useViewer: () => viewer }));
vi.mock("@/features/follow/FollowButton", () => ({
  FollowButton: ({ userId }: { userId: string }) => (
    <button type="button">フォロー {userId}</button>
  ),
}));

const point = (
  kind: CommonPoint["kind"],
  label: string,
  islandName = "星空シアター島",
): CommonPoint => ({ kind, id: `${kind}:${label}`, label, islandName });

const person = (
  n: number,
  commons: CommonPoint[] = [point("member", "ひなた")],
  moreCount = 0,
): RelatedUser => ({
  id: `user-${n}`,
  username: `fan_${n}`,
  displayName: `ファン${n}`,
  commons,
  moreCount,
});

let payload: { users: RelatedUser[]; hasCriteria: boolean };
let fetchMock: ReturnType<typeof vi.fn>;

/** 応答を返す。body を省略すると、呼ばれた時点の payload を返す */
function respond(status: number, body?: unknown) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body ?? payload,
  });
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
}

function App({
  client,
  page = "world",
}: {
  client: QueryClient;
  page?: string;
}) {
  return (
    <QueryClientProvider client={client}>
      <TimelineTabProvider>
        {/* ページを移動すると TimelineTabs だけが作り直される（key で再現する） */}
        <TimelineTabs key={page}>
          <p data-testid="posts-content">{page}の投稿</p>
        </TimelineTabs>
      </TimelineTabProvider>
    </QueryClientProvider>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });
const relatedTab = () => tab("関連ユーザー");
const postsTab = () => tab("投稿");

beforeEach(() => {
  openAuth.mockReset();
  viewer.signedIn = true;
  viewer.user = { id: "me", username: "me_user", displayName: "わたし" };
  payload = { users: [person(1)], hasCriteria: true };
  fetchMock = vi.fn();
  respond(200);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("describeCommon", () => {
  it("共通点の種類ごとに、推している・参戦している、という文になる", () => {
    expect(describeCommon(point("member", "ひなた"))).toBe(
      "ひなたを推しています",
    );
    expect(describeCommon(point("island", "星空シアター島"))).toBe(
      "星空シアター島を推しています",
    );
    // 公演名はグループをまたいで同じことがあるので、グループ名を添える
    expect(describeCommon(point("live", "【デモ】春公演"))).toBe(
      "【デモ】春公演（星空シアター島）に参戦しています",
    );
  });
});

describe("TimelineTabs", () => {
  it("最初は「投稿」を表示し、関連ユーザーは読み込まない", () => {
    render(<App client={makeClient()} />);
    expect(postsTab().getAttribute("aria-selected")).toBe("true");
    expect(relatedTab().getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("posts-content")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("未ログインで「関連ユーザー」を押すと、切り替えずに認証モーダルを開く", async () => {
    viewer.signedIn = false;
    viewer.user = null;
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    expect(openAuth).toHaveBeenCalledWith({
      reason: RELATED_USERS_SIGN_IN_REASON,
    });
    expect(postsTab().getAttribute("aria-selected")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("切り替えると共通点つきのカードを表示し、「投稿」の中身は残したまま隠す", async () => {
    payload = {
      users: [
        person(1, [
          point("member", "ひなた"),
          point("live", "春公演"),
          point("island", "潮風ガールズ島"),
        ]),
        person(2, [point("member", "みさき"), point("member", "かのん")], 2),
      ],
      hasCriteria: true,
    };
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());

    const list = await screen.findByRole("list", {
      name: "共通点のあるユーザー",
    });
    const cards = within(list).getAllByTestId("related-user");
    expect(cards).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/related-users");

    const first = within(cards[0] as HTMLElement);
    expect(
      first.getByRole("link", { name: "ファン1" }).getAttribute("href"),
    ).toBe("/u/fan_1");
    expect(first.getByText("ひなたを推しています")).toBeTruthy();
    expect(
      first.getByText("春公演（星空シアター島）に参戦しています"),
    ).toBeTruthy();
    expect(first.getByText("潮風ガールズ島を推しています")).toBeTruthy();
    expect(first.queryByText(/他\d+件/)).toBeNull();
    expect(first.getByRole("button", { name: /フォロー/ })).toBeTruthy();

    // 表示しきれない共通点は「他N件」にまとめる
    const second = within(cards[1] as HTMLElement);
    expect(second.getByText("他2件")).toBeTruthy();

    // 「投稿」は作り直さず隠すだけ（スクロール位置や入力中の本文が消えない）
    expect(relatedTab().getAttribute("aria-selected")).toBe("true");
    const posts = screen.getByTestId("posts-content");
    expect(posts.closest('[role="tabpanel"]')?.className).toContain("hidden");

    await user.click(postsTab());
    expect(posts.closest('[role="tabpanel"]')?.className).not.toContain(
      "hidden",
    );
    expect(screen.getByTestId("posts-content")).toBe(posts);
  });

  it("選んだタブは、別のページへ移動しても保たれる", async () => {
    const client = makeClient();
    const user = userEvent.setup();
    const { rerender } = render(<App client={client} page="world" />);
    await user.click(relatedTab());
    await screen.findByTestId("related-user");

    rerender(<App client={client} page="island" />);
    expect(relatedTab().getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByTestId("related-user")).toBeTruthy();
  });

  it("閲覧者が変わったら（ログアウト・別のアカウント）、「投稿」に戻る", async () => {
    const client = makeClient();
    const user = userEvent.setup();
    const { rerender } = render(<App client={client} />);
    await user.click(relatedTab());
    await screen.findByTestId("related-user");

    viewer.signedIn = false;
    viewer.user = null;
    rerender(<App client={client} />);
    expect(postsTab().getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByTestId("posts-content").closest('[role="tabpanel"]')
        ?.className,
    ).not.toContain("hidden");
  });
});

describe("RelatedUsers", () => {
  it("最初は10人まで表示し、「もっと見る」で10人ずつ増やす", async () => {
    payload = {
      users: Array.from({ length: 23 }, (_, i) => person(i + 1)),
      hasCriteria: true,
    };
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    await screen.findAllByTestId("related-user");
    expect(screen.getAllByTestId("related-user")).toHaveLength(
      RELATED_USERS_PAGE_SIZE,
    );

    await user.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(screen.getAllByTestId("related-user")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(screen.getAllByTestId("related-user")).toHaveLength(23);
    expect(screen.queryByRole("button", { name: "もっと見る" })).toBeNull();
    // 追加の読み込みはしない（最初に取得した分を見せる）
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("「↻ 更新」で取り直し、結果が変わる", async () => {
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    await screen.findByText("ファン1");

    payload = { users: [person(2)], hasCriteria: true };
    respond(200);
    await user.click(screen.getByRole("button", { name: "↻ 更新" }));
    expect(await screen.findByText("ファン2")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("ファン1")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("推しも参戦記録もないときは、プロフィールで設定する案内を出す", async () => {
    payload = { users: [], hasCriteria: false };
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    const link = await screen.findByRole("link", {
      name: "プロフィールで推しを設定する",
    });
    expect(link.getAttribute("href")).toBe("/u/me_user");
  });

  it("推しはあるが共通する人がいないときは、見つからなかったことを伝える", async () => {
    payload = { users: [], hasCriteria: true };
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    expect(
      await screen.findByText(/共通点のあるユーザーはまだ見つかりませんでした/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "プロフィールで推しを設定する" }),
    ).toBeNull();
  });

  it("取得に失敗したら、エラーを出して「もう一度試す」で取り直せる", async () => {
    respond(500, { error: "x" });
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "読み込めませんでした",
    );

    respond(200);
    await user.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(await screen.findByText("ファン1")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("サーバーがログインを求めたら（セッション切れ）、ログインの案内を出す", async () => {
    respond(401, { error: "ログインが必要です" });
    const user = userEvent.setup();
    render(<App client={makeClient()} />);
    await user.click(relatedTab());
    const button = await screen.findByRole("button", {
      name: "ログイン・新規登録",
    });
    await user.click(button);
    expect(openAuth).toHaveBeenCalledWith({
      reason: RELATED_USERS_SIGN_IN_REASON,
    });
  });
});
