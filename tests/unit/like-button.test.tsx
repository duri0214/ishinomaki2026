// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LikeState } from "@/features/likes/service";
import type { TimelinePage, TimelinePost } from "@/features/timeline/queries";
import type { ActionResult } from "@/lib/action";

const openAuth = vi.fn();
const viewer = { signedIn: true };
const setLikeAction = vi.fn();

vi.mock("@/features/auth/AuthDialog", () => ({
  useAuthDialog: () => openAuth,
}));
vi.mock("@/features/auth/viewer", () => ({ useViewer: () => viewer }));
vi.mock("@/features/likes/actions", () => ({
  setLikeAction: (...args: unknown[]) => setLikeAction(...args),
}));

import { LikeButton } from "@/features/likes/LikeButton";
import { useTimeline } from "@/features/timeline/useTimeline";

const basePost: TimelinePost = {
  id: "11111111-1111-4111-8111-111111111111",
  body: "hello",
  createdAt: "2026-10-11T00:00:00.000Z",
  author: { id: "u1", username: "a", displayName: "a", avatarUrl: null },
  island: { slug: "x", name: "X" },
  likeCount: 3,
  likedByMe: false,
  isMine: false,
};

/** タイムラインのキャッシュから投稿を読んで LikeButton に渡す（本番と同じ構成） */
function Harness() {
  const query = useTimeline(
    { island: "x" },
    { posts: [basePost], nextCursor: null },
  );
  const post = query.data?.pages[0]?.posts[0];
  return post ? <LikeButton post={post} /> : null;
}

function renderHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

/** 呼ばれたあと、テストの側で結果を返せる Promise を作る */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ok = (liked: boolean, likeCount: number): ActionResult<LikeState> => ({
  ok: true,
  data: { liked, likeCount },
});

const count = () => screen.getByTestId("like-count").textContent;

beforeEach(() => {
  setLikeAction.mockReset();
  openAuth.mockReset();
  viewer.signedIn = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () =>
        ({ posts: [basePost], nextCursor: null }) satisfies TimelinePage,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LikeButton", () => {
  it("押すとサーバーの応答を待たずに件数が増え、応答後もその値のまま", async () => {
    const d = deferred<ActionResult<LikeState>>();
    setLikeAction.mockReturnValueOnce(d.promise);
    const user = userEvent.setup();
    renderHarness();
    expect(count()).toBe("3");

    await user.click(screen.getByRole("button", { name: "いいね" }));
    // まだ応答していないが、画面は更新済み（楽観的更新）
    expect(count()).toBe("4");
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();

    d.resolve(ok(true, 4));
    await waitFor(() => expect(setLikeAction).toHaveBeenCalledTimes(1));
    expect(setLikeAction).toHaveBeenCalledWith({
      postId: basePost.id,
      liked: true,
    });
    await waitFor(() => expect(count()).toBe("4"));
  });

  it("サーバーの件数が違えば、サーバーの値に合わせる（他の人のいいねを取り込む）", async () => {
    setLikeAction.mockResolvedValueOnce(ok(true, 9));
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole("button", { name: "いいね" }));
    await waitFor(() => expect(count()).toBe("9"));
  });

  it("連打しても、送信は1件ずつ順番に行われ、最後に押した状態で件数が正しく収まる", async () => {
    const first = deferred<ActionResult<LikeState>>();
    const second = deferred<ActionResult<LikeState>>();
    const third = deferred<ActionResult<LikeState>>();
    setLikeAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const user = userEvent.setup();
    renderHarness();

    // いいね → 取り消し → いいね を素早く押す
    await user.click(screen.getByRole("button", { name: "いいね" }));
    await user.click(screen.getByRole("button", { name: "いいねを取り消す" }));
    await user.click(screen.getByRole("button", { name: "いいね" }));
    expect(count()).toBe("4"); // 最後の状態: いいね済み

    // 1件目の応答が返るまで、2件目は送られない
    await waitFor(() => expect(setLikeAction).toHaveBeenCalledTimes(1));
    expect(setLikeAction).toHaveBeenLastCalledWith({
      postId: basePost.id,
      liked: true,
    });

    first.resolve(ok(true, 4));
    await waitFor(() => expect(setLikeAction).toHaveBeenCalledTimes(2));
    expect(setLikeAction).toHaveBeenLastCalledWith({
      postId: basePost.id,
      liked: false,
    });
    // 途中の応答（取り消し済みの件数）で画面を巻き戻さない
    expect(count()).toBe("4");

    second.resolve(ok(false, 3));
    await waitFor(() => expect(setLikeAction).toHaveBeenCalledTimes(3));
    expect(setLikeAction).toHaveBeenLastCalledWith({
      postId: basePost.id,
      liked: true,
    });

    third.resolve(ok(true, 4));
    await waitFor(() => expect(count()).toBe("4"));
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });

  it("未ログインなら登録・ログインのモーダルを開き、送信しない", async () => {
    viewer.signedIn = false;
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole("button", { name: "いいね" }));
    expect(openAuth).toHaveBeenCalledWith({
      reason: "いいねするにはアカウントが必要です",
    });
    expect(setLikeAction).not.toHaveBeenCalled();
    expect(count()).toBe("3");
  });

  it("サーバーがエラーを返したら、メッセージを出して最新の状態を取り直す", async () => {
    setLikeAction.mockResolvedValueOnce({
      ok: false,
      code: "post_not_found",
      message: "投稿が見つかりません",
    } satisfies ActionResult<LikeState>);
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole("button", { name: "いいね" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "投稿が見つかりません",
    );
    // タイムラインを取り直して、楽観的に変えた表示を元に戻す
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(count()).toBe("3"));
  });

  it("未ログインのまま送信されてサーバーが unauthorized を返したら（セッション切れ）、モーダルを開く", async () => {
    setLikeAction.mockResolvedValueOnce({
      ok: false,
      code: "unauthorized",
      message: "ログインが必要です",
    } satisfies ActionResult<LikeState>);
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole("button", { name: "いいね" }));
    await waitFor(() => expect(openAuth).toHaveBeenCalledTimes(1));
  });
});
