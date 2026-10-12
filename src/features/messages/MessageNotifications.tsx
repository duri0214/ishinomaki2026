"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useViewer } from "@/features/auth/viewer";
import { markConversationReadAction } from "./actions";
import { createNotificationSound } from "./notification-sound";
import type { MessageNotification, MessageNotifications } from "./types";
import {
  MESSAGES_KEY,
  PrivateMessageError,
  readPrivate,
  refreshActiveConversation,
} from "./useMessages";

export const NOTIFICATION_INTERVAL_MS = 5_000;
const SOUND_PREFERENCE = "ishinomaki-dm-sound";

type Notifications = {
  unreadCount: number;
  conversations: MessageNotification[];
  visible: boolean;
  soundEnabled: boolean;
  soundReady: boolean;
  toggleSound: () => void;
  markRead: (conversationId: string, lastMessageId: string) => Promise<boolean>;
};

const NotificationsContext = createContext<Notifications>({
  unreadCount: 0,
  conversations: [],
  visible: true,
  soundEnabled: true,
  soundReady: false,
  toggleSound: () => {},
  markRead: async () => false,
});

export const useMessageNotifications = () => useContext(NotificationsContext);

export function changedNotifications(
  previous: MessageNotification[] | null,
  current: MessageNotification[],
) {
  const old = new Map(previous?.map((row) => [row.conversationId, row]));
  const changed = current.filter((row) => {
    const before = old.get(row.conversationId);
    return (
      !before ||
      before.latestMessageId !== row.latestMessageId ||
      before.unreadCount !== row.unreadCount
    );
  });
  const incoming =
    previous !== null &&
    current.some((row) => {
      const before = old.get(row.conversationId);
      return (
        row.latestIncomingId !== null &&
        (!before ||
          before.latestIncomingId !== row.latestIncomingId ||
          row.unreadCount > before.unreadCount)
      );
    });
  return { changed, incoming };
}

export function MessageNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useViewer();
  const viewerId = user?.id ?? null;
  const client = useQueryClient();
  const [visible, setVisible] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const sound = useRef<ReturnType<typeof createNotificationSound> | null>(null);
  const previous = useRef<{
    viewerId: string;
    rows: MessageNotification[];
  } | null>(null);
  const key = [MESSAGES_KEY, viewerId, "notifications"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      readPrivate<MessageNotifications>(
        "/api/messages/notifications",
        viewerId ?? "",
        signal,
      ),
    enabled: Boolean(viewerId) && visible,
    refetchInterval: (q) =>
      q.state.error instanceof PrivateMessageError &&
      q.state.error.status === 401
        ? false
        : q.state.status === "error"
          ? 30_000
          : NOTIFICATION_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (previous.current?.viewerId !== viewerId) previous.current = null;
  }, [viewerId]);

  useEffect(() => {
    if (
      query.error instanceof PrivateMessageError &&
      query.error.status === 401
    )
      void client.resetQueries({
        predicate: (q) =>
          q.queryKey[0] === MESSAGES_KEY &&
          q.queryKey[1] === viewerId &&
          q.queryKey[2] !== "notifications",
      });
  }, [query.error, client, viewerId]);

  useEffect(() => {
    const onVisibility = () =>
      setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    try {
      setSoundEnabled(localStorage.getItem(SOUND_PREFERENCE) !== "off");
    } catch {
      /* 保存不可ならページ内だけで扱う。 */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === SOUND_PREFERENCE) setSoundEnabled(e.newValue !== "off");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!viewerId || !soundEnabled) {
      setSoundReady(false);
      return;
    }
    const player = sound.current ?? createNotificationSound();
    sound.current = player;
    let alive = true;
    const unlock = () => {
      void player.unlock().then((ready) => {
        if (alive) setSoundReady(ready);
      });
    };
    document.addEventListener("click", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    return () => {
      alive = false;
      document.removeEventListener("click", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      player.dispose();
      sound.current = null;
    };
  }, [viewerId, soundEnabled]);

  useEffect(() => {
    const current = query.data;
    if (
      !viewerId ||
      !query.dataUpdatedAt ||
      current?.viewerId !== viewerId ||
      query.isError
    )
      return;
    const before =
      previous.current?.viewerId === viewerId ? previous.current.rows : null;
    const { changed, incoming } = changedNotifications(
      before,
      current.conversations,
    );
    previous.current = { viewerId, rows: current.conversations };
    if (incoming && soundEnabled && document.visibilityState === "visible")
      void sound.current?.play();
    if (changed.length > 0) {
      void client.invalidateQueries({
        queryKey: [MESSAGES_KEY, viewerId, "list"],
        exact: true,
      });
    }
    // 一時的な取得失敗でも、次回の確認で表示中の会話を追いつかせる。
    for (const row of current.conversations)
      void refreshActiveConversation(
        client,
        viewerId,
        row.conversationId,
        row.latestMessageId,
      );
  }, [
    query.data,
    query.dataUpdatedAt,
    query.isError,
    viewerId,
    soundEnabled,
    client,
  ]);

  const markRead = useCallback(
    async (conversationId: string, lastMessageId: string) => {
      if (!viewerId || document.visibilityState !== "visible") return false;
      try {
        const result = await markConversationReadAction({
          conversationId,
          lastMessageId,
        });
        if (!result.ok) return false;
        await client.invalidateQueries({
          queryKey: [MESSAGES_KEY, viewerId, "notifications"],
          exact: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    [client, viewerId],
  );

  const toggleSound = () => {
    if (soundEnabled && !soundReady) {
      void sound.current?.unlock().then(setSoundReady);
      return;
    }
    const next = !soundEnabled;
    if (next) {
      const player = createNotificationSound();
      sound.current = player;
      // 再有効化のクリック自体を使って、ブラウザの音声制限を解除する。
      void player.unlock().then((ready) => {
        if (sound.current === player) setSoundReady(ready);
      });
    }
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_PREFERENCE, next ? "on" : "off");
    } catch {
      /* 設定はページ内に保持する。 */
    }
  };

  const conversations =
    viewerId && query.data?.viewerId === viewerId && !query.isError
      ? query.data.conversations
      : [];
  const unreadCount = conversations.reduce(
    (sum, row) => sum + row.unreadCount,
    0,
  );
  return (
    <NotificationsContext.Provider
      value={{
        unreadCount,
        conversations,
        visible,
        soundEnabled,
        soundReady,
        toggleSound,
        markRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function NotificationSoundButton() {
  const { soundEnabled, soundReady, toggleSound } = useMessageNotifications();
  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={soundEnabled && soundReady}
      aria-label={
        soundEnabled && soundReady ? "通知音をオフにする" : "通知音を有効にする"
      }
      className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-[10px] text-[var(--ui-accent)] hover:bg-[var(--ui-hover)]"
    >
      {soundEnabled ? (soundReady ? "♪ 音オン" : "♪ 音を有効化") : "♪ 音オフ"}
    </button>
  );
}
