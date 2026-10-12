// @vitest-environment jsdom
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerProvider, type ViewerUser } from "@/features/auth/viewer";
import {
  MessageNotificationsProvider,
  NotificationSoundButton,
  useMessageNotifications,
} from "@/features/messages/MessageNotifications";
import type {
  MessageNotification,
  MessagePage,
} from "@/features/messages/types";
import {
  mergeLatestMessages,
  refreshActiveConversation,
} from "@/features/messages/useMessages";

const { play, unlock, dispose, markRead } = vi.hoisted(() => ({
  play: vi.fn(),
  unlock: vi.fn(),
  dispose: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("@/features/messages/notification-sound", () => ({
  createNotificationSound: () => ({ play, unlock, dispose }),
}));
vi.mock("@/features/messages/actions", () => ({
  markConversationReadAction: markRead,
}));
const user: ViewerUser = {
  id: "viewer",
  username: "viewer",
  displayName: "閲覧者",
};
const first: MessageNotification = {
  conversationId: "thread",
  latestMessageId: "one",
  latestIncomingId: "one",
  unreadCount: 1,
};
let rows: MessageNotification[];
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  rows = [first];
  unlock.mockResolvedValue(true);
  markRead.mockResolvedValue({ ok: true, data: null });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  focusManager.setFocused(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        viewerId: user.id,
        conversations: rows.map((row) => ({ ...row })),
      }),
    })),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Observer() {
  const { unreadCount } = useMessageNotifications();
  return (
    <>
      <output data-testid="count">{unreadCount}</output>
      <NotificationSoundButton />
    </>
  );
}
function setup() {
  const client = new QueryClient();
  clients.push(client);
  const tree = (viewer: ViewerUser | null) => (
    <QueryClientProvider client={client}>
      <ViewerProvider user={viewer}>
        <MessageNotificationsProvider>
          <Observer />
        </MessageNotificationsProvider>
      </ViewerProvider>
    </QueryClientProvider>
  );
  const view = render(tree(user));
  return { ...view, tree };
}
async function tick(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}

it("初期の未読では鳴らさず、新しい受信だけ一度鳴らして件数を更新する", async () => {
  setup();
  await tick();
  expect(screen.getByTestId("count").textContent).toBe("1");
  expect(play).not.toHaveBeenCalled();
  rows = [
    {
      ...first,
      latestMessageId: "two",
      latestIncomingId: "two",
      unreadCount: 2,
    },
  ];
  await tick(5_000);
  expect(screen.getByTestId("count").textContent).toBe("2");
  expect(play).toHaveBeenCalledTimes(1);
  await tick(5_000);
  expect(play).toHaveBeenCalledTimes(1);
  rows = [{ ...(rows[0] as MessageNotification), latestMessageId: "my-reply" }];
  await tick(5_000);
  rows = [{ ...(rows[0] as MessageNotification), unreadCount: 0 }];
  await tick(5_000);
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("count").textContent).toBe("0");
});

it("非表示タブとログアウト中は定期取得を止め、復帰時に追いつく", async () => {
  const view = setup();
  await tick();
  const fetched = vi.mocked(fetch).mock.calls.length;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(15_000);
  expect(fetch).toHaveBeenCalledTimes(fetched);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick();
  expect(fetch).toHaveBeenCalledTimes(fetched + 1);
  view.rerender(view.tree(null));
  await tick(15_000);
  expect(fetch).toHaveBeenCalledTimes(fetched + 1);
  expect(screen.getByTestId("count").textContent).toBe("0");
  rows = [
    {
      ...first,
      latestMessageId: "after-login",
      latestIncomingId: "after-login",
      unreadCount: 3,
    },
  ];
  view.rerender(view.tree(user));
  await tick();
  expect(screen.getByTestId("count").textContent).toBe("3");
  expect(play).not.toHaveBeenCalled();
});

it("通知音をオフにしても新着は取得し、再有効化のクリックで音声を準備する", async () => {
  setup();
  await tick();
  fireEvent.click(document);
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "通知音をオフにする" }));
  expect(localStorage.getItem("ishinomaki-dm-sound")).toBe("off");
  rows = [
    {
      ...first,
      latestMessageId: "muted",
      latestIncomingId: "muted",
      unreadCount: 2,
    },
  ];
  await tick(5_000);
  expect(screen.getByTestId("count").textContent).toBe("2");
  expect(play).not.toHaveBeenCalled();
  const attempts = unlock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "通知音を有効にする" }));
  await tick();
  expect(unlock).toHaveBeenCalledTimes(attempts + 1);
  expect(localStorage.getItem("ishinomaki-dm-sound")).toBe("on");
  rows = [
    {
      ...first,
      latestMessageId: "unmuted",
      latestIncomingId: "unmuted",
      unreadCount: 3,
    },
  ];
  await tick(5_000);
  expect(play).toHaveBeenCalledTimes(1);
});

function page(ids: number[], nextCursor: string | null): MessagePage {
  return {
    conversation: {
      id: "thread",
      peer: {
        id: "peer",
        username: "peer",
        displayName: "相手",
        deleted: false,
      },
    },
    messages: ids.map((id) => ({
      id: String(id),
      senderId: "peer",
      body: `本文${id}`,
      createdAt: new Date(id * 1_000).toISOString(),
    })),
    nextCursor,
  };
}

it("新着1ページを重複なく取り込み、取得済みの過去のページとカーソルを維持する", () => {
  const history = {
    pages: [page([3, 4], "older"), page([1, 2], null)],
    pageParams: [null, "older"],
  };
  const merged = mergeLatestMessages(history, page([4, 5], "new-cursor"));
  expect(merged.pages[0]?.messages.map((m) => m.id)).toEqual(["3", "4", "5"]);
  expect(merged.pages[0]?.nextCursor).toBe("older");
  expect(merged.pages[1]).toEqual(history.pages[1]);
  expect(merged.pageParams).toEqual(history.pageParams);
  expect(mergeLatestMessages(merged, page([3, 4], "stale"))).toBe(merged);
});

it("長時間離れて履歴に隙間ができる場合は、最新ページから過去を取得し直せる", () => {
  const latest = page([30, 31], "before-30");
  expect(
    mergeLatestMessages(
      { pages: [page([1, 2], null)], pageParams: [null] },
      latest,
    ),
  ).toEqual({ pages: [latest], pageParams: [null] });
});

it("新着がある会話の最新1ページだけを取得し、通信失敗後の確認でも再試行する", async () => {
  const client = new QueryClient();
  clients.push(client);
  const key = ["messages", user.id, "thread"];
  const history = {
    pages: [page([3, 4], "older"), page([1, 2], null)],
    pageParams: [null, "older"],
  };
  client.setQueryData(key, history);
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => history,
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await refreshActiveConversation(client, user.id, "thread", "4");
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await refreshActiveConversation(client, user.id, "thread", "5");
    expect(client.getQueryData(key)).toEqual(history);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ viewerId: user.id, ...page([4, 5], "new-cursor") }),
      ),
    );
    await refreshActiveConversation(client, user.id, "thread", "5");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "/api/messages/thread",
      "/api/messages/thread",
    ]);
    expect(client.getQueryData<typeof history>(key)?.pages[1]).toEqual(
      history.pages[1],
    );
    await refreshActiveConversation(client, user.id, "thread", "5");
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});
