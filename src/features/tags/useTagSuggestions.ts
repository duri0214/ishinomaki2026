"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TagSearchResult } from "./queries";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** 島内のタグ候補を取得する（入力のたびに送らないよう少し待つ） */
export function useTagSuggestions(
  island: string | undefined,
  query: string,
  enabled: boolean,
) {
  const debounced = useDebounced(query, 150);
  return useQuery({
    queryKey: ["tag-search", island ?? null, debounced],
    queryFn: async ({ signal }): Promise<TagSearchResult[]> => {
      const params = new URLSearchParams({
        island: island ?? "",
        q: debounced,
      });
      const res = await fetch(`/api/tags/search?${params}`, { signal });
      if (!res.ok) throw new Error("タグを検索できませんでした");
      return (await res.json()).tags;
    },
    enabled: enabled && Boolean(island),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
