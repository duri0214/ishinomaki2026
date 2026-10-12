"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function QueryProvider({
  children,
  viewerId,
}: {
  children: React.ReactNode;
  viewerId: string | null;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => {
    // 認証モーダル・マップは維持し、以前の閲覧者のDMだけをキャンセルして破棄する。
    const previous = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === "messages" && query.queryKey[1] !== viewerId,
    };
    void client.cancelQueries(previous);
    client.removeQueries(previous);
  }, [client, viewerId]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
