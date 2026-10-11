"use client";

import { createContext, useContext } from "react";

export type ViewerUser = {
  id: string;
  username: string;
  displayName: string;
};

export type Viewer = {
  signedIn: boolean;
  user: ViewerUser | null;
};

const ViewerContext = createContext<Viewer>({ signedIn: false, user: null });

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}

/** サーバーで判定した閲覧者を配る。ログイン・ログアウト後は router.refresh() で更新される */
export function ViewerProvider({
  user,
  children,
}: {
  user: ViewerUser | null;
  children: React.ReactNode;
}) {
  return (
    <ViewerContext.Provider value={{ signedIn: user !== null, user }}>
      {children}
    </ViewerContext.Provider>
  );
}
