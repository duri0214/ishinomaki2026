"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext } from "react";

export type Viewer = {
  /** Clerk のキーが設定されていて、ログインできる状態か */
  authEnabled: boolean;
  signedIn: boolean;
};

const ViewerContext = createContext<Viewer>({
  authEnabled: false,
  signedIn: false,
});

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}

function ClerkViewerProvider({
  initialSignedIn,
  children,
}: {
  initialSignedIn: boolean;
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  // Clerk の読み込みが終わるまでは、サーバーで判定した状態を使う（ハイドレーションのずれ防止）
  const signedIn = isLoaded ? Boolean(isSignedIn) : initialSignedIn;
  return (
    <ViewerContext.Provider value={{ authEnabled: true, signedIn }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function ViewerProvider({
  authEnabled,
  initialSignedIn,
  children,
}: {
  authEnabled: boolean;
  initialSignedIn: boolean;
  children: React.ReactNode;
}) {
  if (!authEnabled) {
    return (
      <ViewerContext.Provider value={{ authEnabled: false, signedIn: false }}>
        {children}
      </ViewerContext.Provider>
    );
  }
  return (
    <ClerkViewerProvider initialSignedIn={initialSignedIn}>
      {children}
    </ClerkViewerProvider>
  );
}
