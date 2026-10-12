"use client";

import { useSyncExternalStore } from "react";

/**
 * タグ検索の入力中の文字列を、マップと共有する（ページを移動しても消えない）。
 * 入力があるあいだ、島の10軒の家は検索結果に入れ替わる。
 */
let query = "";
const listeners = new Set<() => void>();

export function setMapSearch(next: string) {
  if (next === query) return;
  query = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMapSearch(): string {
  return useSyncExternalStore(
    subscribe,
    () => query,
    () => "",
  );
}
