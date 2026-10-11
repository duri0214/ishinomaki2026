"use client";

import { useQuery } from "@tanstack/react-query";
import type { ArtistProfile } from "./types";

export function useArtistProfile(slug: string) {
  return useQuery({
    queryKey: ["artist-profile", slug],
    queryFn: async ({ signal }): Promise<ArtistProfile> => {
      const res = await fetch(`/api/artists/${encodeURIComponent(slug)}`, {
        signal,
      });
      if (!res.ok) throw new Error("アーティスト情報を読み込めませんでした");
      return (await res.json()).profile;
    },
    staleTime: 60_000,
    retry: false,
  });
}
