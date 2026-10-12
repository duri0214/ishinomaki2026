"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { useAuthDialog } from "@/features/auth/AuthDialog";
import { useViewer } from "@/features/auth/viewer";
import { RELATED_USERS_SIGN_IN_REASON } from "./constants";
import { RelatedUsers } from "./RelatedUsers";

export type TimelineTab = "posts" | "related";

type TabState = { tab: TimelineTab; select: (tab: TimelineTab) => void };

const TabContext = createContext<TabState>({
  tab: "posts",
  select: () => {},
});

/**
 * 選んでいるタブを、島・タグ・世界地図のページ移動をまたいで保つ（ページ側のタブは移動で作り直されるため）。
 * 閲覧者が変わったとき（ログイン・ログアウト）は「投稿」に戻す。
 */
export function TimelineTabProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useViewer();
  const owner = user?.id ?? null;
  const [state, setState] = useState<{
    owner: string | null;
    tab: TimelineTab;
  }>({ owner, tab: "posts" });
  // 別の閲覧者になったら、前の人が選んでいたタブを引き継がない
  if (state.owner !== owner) setState({ owner, tab: "posts" });
  const tab = state.owner === owner ? state.tab : "posts";
  const select = useCallback(
    (next: TimelineTab) => setState({ owner, tab: next }),
    [owner],
  );
  const value = useMemo(() => ({ tab, select }), [tab, select]);
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

/**
 * タイムラインの「投稿」と「関連ユーザー」のタブ。children（従来の投稿フォームとタイムライン）は
 * 「投稿」の中身で、タブを切り替えても作り直さない（スクロール位置と入力中の本文を保つ）。
 * 未ログインで「関連ユーザー」を押したときは、切り替えずに認証モーダルを開く。
 */
export function TimelineTabs({ children }: { children: React.ReactNode }) {
  const { tab, select } = useContext(TabContext);
  const { signedIn } = useViewer();
  const openAuth = useAuthDialog();
  const baseId = useId();
  // 一度開いたら、タブを切り替えても残す（「もっと見る」の状態とフォローの表示を保つ）
  const [relatedOpened, setRelatedOpened] = useState(tab === "related");
  if (tab === "related" && !relatedOpened) setRelatedOpened(true);

  const onSelect = (next: TimelineTab) => {
    if (next === "related" && !signedIn) {
      openAuth({ reason: RELATED_USERS_SIGN_IN_REASON });
      return;
    }
    select(next);
  };

  const tabs = [
    { id: "posts", label: "投稿" },
    { id: "related", label: "関連ユーザー" },
  ] as const;

  return (
    <>
      <div
        role="tablist"
        aria-label="タイムラインの表示"
        className="design-segmented mx-4 mb-1 mt-1 grid shrink-0 grid-cols-2 text-sm font-bold"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={
              id === "related" && !relatedOpened
                ? undefined
                : `${baseId}-panel-${id}`
            }
            onClick={() => onSelect(id)}
            className="design-segment py-1.5 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-posts`}
        aria-labelledby={`${baseId}-tab-posts`}
        className={tab === "posts" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
      >
        {children}
      </div>
      {relatedOpened && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-related`}
          aria-labelledby={`${baseId}-tab-related`}
          className={
            tab === "related" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <RelatedUsers active={tab === "related"} />
        </div>
      )}
    </>
  );
}
