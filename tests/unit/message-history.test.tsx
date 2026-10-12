// @vitest-environment jsdom
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerProvider } from "@/features/auth/viewer";
import { MessageComposer } from "@/features/messages/MessageComposer";
import {
  MessageNotificationsProvider,
  useMessageNotifications,
} from "@/features/messages/MessageNotifications";
import { MessagesView } from "@/features/messages/MessagesView";
import type { Message } from "@/features/messages/types";
import {
  refreshActiveConversation,
  useMessages,
} from "@/features/messages/useMessages";

const { markReadAction, sendAction } = vi.hoisted(() => ({
  markReadAction: vi.fn(),
  sendAction: vi.fn(),
}));
vi.mock("@/features/messages/actions", () => ({
  markConversationReadAction: markReadAction,
  sendMessageAction: sendAction,
}));
vi.mock("@/features/auth/AuthDialog", () => ({
  useAuthDialog: () => vi.fn(),
}));
vi.mock("@/features/messages/notification-sound", () => ({
  createNotificationSound: () => ({
    unlock: async () => true,
    play: vi.fn(),
    dispose: vi.fn(),
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const clients: QueryClient[] = [];
const user = { id: "viewer", username: "viewer", displayName: "閲覧者" };
const conversation = {
  id: "thread",
  peer: { id: "peer", username: "peer", displayName: "相手", deleted: false },
};
function message(id: number): Message {
  return {
    id: String(id),
    body: `本文${id}`,
    senderId: "peer",
    createdAt: new Date(id * 1_000).toISOString(),
  };
}
function createClient() {
  const client = new QueryClient();
  clients.push(client);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  focusManager.setFocused(true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

async function setupHistory() {
  const client = createClient();
  const server = { count: 40 };
  const cursors: Array<string | null> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const cursor = new URL(url, "http://localhost").searchParams.get(
        "cursor",
      );
      cursors.push(cursor);
      const all = Array.from({ length: server.count }, (_, i) => i + 1);
      const available = all.filter((id) => !cursor || id < Number(cursor));
      const page = available.slice(-20);
      return new Response(
        JSON.stringify({
          viewerId: user.id,
          conversation,
          messages: page.map(message),
          nextCursor: available.length > 20 ? String(page[0]) : null,
        }),
      );
    }),
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => ({ ...useMessages(user.id, "thread") }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  const messages = () => result.current.data?.pages.flatMap((p) => p.messages);
  expect(messages()).toHaveLength(40);
  return { client, server, cursors, result, messages, wrapper };
}

it("新着取り込み後にタブへ戻っても、過去のページを再取得せず全履歴を保持する", async () => {
  const { client, server, cursors, result, messages } = await setupHistory();
  server.count = 41;
  await act(async () => {
    await refreshActiveConversation(client, user.id, "thread", "41");
  });
  await waitFor(() => expect(messages()).toHaveLength(41));
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(cursors).toHaveLength(4));
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  expect(cursors).toEqual([null, "21", null, null]);
  expect(messages()).toHaveLength(41);
  expect(messages()?.[0]?.id).toBe("21");
  expect(messages()?.map((m) => m.id)).toContain("1");
});

it("送信成功後の更新でも、新着取り込みで増えた履歴と過去のページを保持する", async () => {
  const {
    client,
    server,
    cursors,
    result,
    messages,
    wrapper: Wrapper,
  } = await setupHistory();
  server.count = 41;
  await act(async () => {
    await refreshActiveConversation(client, user.id, "thread", "41");
  });
  await waitFor(() => expect(messages()).toHaveLength(41));
  sendAction.mockImplementationOnce(async () => {
    server.count = 42;
    return { ok: true, data: message(42) };
  });
  render(
    <Wrapper>
      <MessageComposer conversationId="thread" />
    </Wrapper>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "返信" } });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  await waitFor(() => expect(messages()).toHaveLength(42));
  expect(messages()?.map((m) => m.id)).toContain("1");
  expect(cursors).toEqual([null, "21", null, null]);
});

it("1ページを超える新着は未取得の範囲だけ補完し、読み込み済みの履歴を保持する", async () => {
  const { client, server, cursors, messages } = await setupHistory();
  server.count = 65;
  await act(async () => {
    await refreshActiveConversation(client, user.id, "thread", "65");
  });
  await waitFor(() => expect(messages()).toHaveLength(65));
  expect(new Set(messages()?.map((m) => m.id)).size).toBe(65);
  expect(cursors).toEqual([null, "21", null, "46"]);
});

function UnreadCount() {
  const { unreadCount } = useMessageNotifications();
  return <output data-testid="unread">{unreadCount}</output>;
}
function setupConversation() {
  vi.useFakeTimers();
  const client = createClient();
  const server = { messages: [message(2)], unread: 1, failNextHistory: false };
  markReadAction.mockReset().mockImplementation(async () => {
    server.unread = 0;
    return { ok: true, data: null };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("notifications"))
        return new Response(
          JSON.stringify({
            viewerId: user.id,
            conversations: [
              {
                conversationId: "thread",
                latestMessageId: "2",
                latestIncomingId: "2",
                unreadCount: server.unread,
              },
            ],
          }),
        );
      if (server.failNextHistory) {
        server.failNextHistory = false;
        throw new Error("offline");
      }
      return new Response(
        JSON.stringify({
          viewerId: user.id,
          conversation,
          messages: server.messages,
          nextCursor: null,
        }),
      );
    }),
  );
  const view = render(
    <QueryClientProvider client={client}>
      <ViewerProvider user={user}>
        <MessageNotificationsProvider>
          <MessagesView ownerId={user.id} conversationId="thread" />
          <UnreadCount />
        </MessageNotificationsProvider>
      </ViewerProvider>
    </QueryClientProvider>,
  );
  return { ...view, server };
}
async function tick(ms = 100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}

it("最新IDが変わらない受信も取得し、本文の取得失敗を次回確認で再試行して既読にする", async () => {
  const { server } = setupConversation();
  await tick();
  expect(markReadAction).toHaveBeenCalledTimes(1);
  server.messages = [
    { ...message(1), createdAt: message(2).createdAt },
    message(2),
  ];
  server.unread = 1;
  server.failNextHistory = true;
  await tick(5_000);
  expect(screen.queryByText("本文1")).toBeNull();
  await tick(5_000);
  expect(screen.getByText("本文1")).toBeTruthy();
  expect(markReadAction).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("unread").textContent).toBe("0");
});

it("既読更新が失敗しても会話を開いたまま再試行し、成功後は止める", async () => {
  setupConversation();
  markReadAction.mockResolvedValueOnce({ ok: false, code: "internal" });
  await tick();
  expect(markReadAction).toHaveBeenCalledTimes(1);
  await tick(5_000);
  expect(markReadAction).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("unread").textContent).toBe("0");
  await tick(15_000);
  expect(markReadAction).toHaveBeenCalledTimes(2);
});

it("非表示の会話では既読更新の再試行を止め、戻ると再試行する", async () => {
  const view = setupConversation();
  markReadAction.mockResolvedValueOnce({ ok: false, code: "internal" });
  await tick();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(15_000);
  expect(markReadAction).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick();
  expect(markReadAction).toHaveBeenCalledTimes(2);
  view.unmount();
  await tick(15_000);
  expect(markReadAction).toHaveBeenCalledTimes(2);
});
