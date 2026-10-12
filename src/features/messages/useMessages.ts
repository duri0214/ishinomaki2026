"use client";

import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ConversationSummary, MessagePage } from "./types";

export const MESSAGES_KEY = "messages";

export class PrivateMessageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readPrivate<T>(
  url: string,
  viewerId: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok)
    throw new PrivateMessageError(
      data.error ?? "メッセージを読み込めませんでした",
      response.status,
    );
  // 別タブでアカウントが切り替わっていても、別人の応答を現在の画面へ渡さない。
  if (data.viewerId !== viewerId)
    throw new PrivateMessageError(
      "ログイン状態が変わりました。画面を更新してください",
      401,
    );
  return data;
}

type MessageHistory = InfiniteData<MessagePage, string | null>;

async function fetchLatestMessages(
  viewerId: string,
  conversationId: string,
  first: MessagePage | undefined,
  signal: AbortSignal,
): Promise<MessagePage> {
  const url = `/api/messages/${conversationId}`;
  let latest = await readPrivate<MessagePage>(url, viewerId, signal);
  const previousNewest = first?.messages.at(-1);
  // 復帰までに1ページ以上増えていても、取得済みの履歴まで新着だけをつなぐ。
  while (previousNewest && latest.nextCursor) {
    const oldest = latest.messages[0];
    if (
      !oldest ||
      oldest.createdAt < previousNewest.createdAt ||
      (oldest.createdAt === previousNewest.createdAt &&
        oldest.id <= previousNewest.id)
    )
      break;
    const params = new URLSearchParams({ cursor: latest.nextCursor });
    const older = await readPrivate<MessagePage>(
      `${url}?${params}`,
      viewerId,
      signal,
    );
    latest = {
      ...latest,
      messages: [...older.messages, ...latest.messages],
      nextCursor: older.nextCursor,
    };
  }
  return latest;
}

/** 新着を最新1ページから取り込み、取得済みの過去の履歴・カーソルを維持する。 */
export function mergeLatestMessages(
  old: MessageHistory | undefined,
  latest: MessagePage,
): MessageHistory {
  const first = old?.pages[0];
  if (!first || first.messages.length === 0)
    return { pages: [latest], pageParams: [null] };
  const previousNewest = first.messages[first.messages.length - 1];
  const currentNewest = latest.messages[latest.messages.length - 1];
  if (!currentNewest) return old;
  if (
    previousNewest &&
    (currentNewest.createdAt < previousNewest.createdAt ||
      (currentNewest.createdAt === previousNewest.createdAt &&
        currentNewest.id < previousNewest.id))
  )
    return old;
  // 非表示中などに20件以上届いた場合は最新から読み直し、途中の履歴を欠落させない。
  if (!latest.messages.some((m) => m.id === previousNewest?.id))
    return { pages: [latest], pageParams: [null] };
  const messages = Array.from(
    new Map(
      [...first.messages, ...latest.messages].map((m) => [m.id, m]),
    ).values(),
  ).sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  return {
    ...old,
    pages: [
      { ...first, conversation: latest.conversation, messages },
      ...old.pages.slice(1),
    ],
  };
}

export async function refreshActiveConversation(
  client: QueryClient,
  viewerId: string,
  conversationId: string,
  expectedLatestId?: string,
  force = false,
) {
  const key = [MESSAGES_KEY, viewerId, conversationId];
  const cached = client.getQueryCache().find({ queryKey: key, exact: true });
  if (!cached?.isActive() || cached.state.fetchStatus === "fetching")
    return false;
  const history = client.getQueryData<MessageHistory>(key);
  if (!history) return false;
  if (
    !force &&
    expectedLatestId &&
    history.pages[0]?.messages.at(-1)?.id === expectedLatestId
  )
    return true;
  try {
    const latest = await client.fetchQuery({
      queryKey: [...key, "latest"],
      queryFn: ({ signal }) =>
        fetchLatestMessages(viewerId, conversationId, history.pages[0], signal),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    });
    // ログアウトや別ページへの移動で破棄されたキャッシュを復活させない。
    if (
      client.getQueryCache().find({ queryKey: key, exact: true }) === cached &&
      cached.isActive()
    ) {
      client.setQueryData<MessageHistory>(key, (old) =>
        mergeLatestMessages(old, latest),
      );
      return true;
    }
  } catch (error) {
    if (
      error instanceof PrivateMessageError &&
      [401, 403, 404].includes(error.status)
    )
      await client.resetQueries({ queryKey: key, exact: true });
  }
  return false;
}

export function useConversations(viewerId: string) {
  return useQuery({
    queryKey: [MESSAGES_KEY, viewerId, "list"],
    queryFn: ({ signal }) =>
      readPrivate<{ conversations: ConversationSummary[] }>(
        "/api/messages",
        viewerId,
        signal,
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useMessages(viewerId: string, conversationId: string) {
  const client = useQueryClient();
  const key = [MESSAGES_KEY, viewerId, conversationId];
  return useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ signal, pageParam }) => {
      const old = client.getQueryData<MessageHistory>(key);
      if (pageParam) {
        // Infinite Queryの再取得でも、読み込み済みの過去のページは維持する。
        const index = old?.pageParams.indexOf(pageParam) ?? -1;
        const cached = old?.pages[index];
        if (cached) return cached;
        const params = new URLSearchParams({ cursor: pageParam });
        return readPrivate<MessagePage>(
          `/api/messages/${conversationId}?${params}`,
          viewerId,
          signal,
        );
      }
      const latest = await fetchLatestMessages(
        viewerId,
        conversationId,
        old?.pages[0],
        signal,
      );
      return mergeLatestMessages(old, latest).pages[0] ?? latest;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
