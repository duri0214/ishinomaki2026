"use client";

import { useQuery } from "@tanstack/react-query";
import { RELATED_USERS_KEY } from "./constants";
import type { RelatedUsersResult } from "./service";

/** サーバーがログインを求めた（セッション切れ）。画面ではログインの案内を出す */
export class SignInRequiredError extends Error {
  constructor() {
    super("ログインが必要です");
    this.name = "SignInRequiredError";
  }
}

async function fetchRelatedUsers(): Promise<RelatedUsersResult> {
  const res = await fetch("/api/related-users");
  if (res.status === 401) throw new SignInRequiredError();
  if (!res.ok) {
    throw new Error(
      `共通点のあるユーザーを読み込めませんでした (${res.status})`,
    );
  }
  return res.json();
}

/**
 * 共通点のあるユーザー。`enabled` は「タブを開いていて、ログインしている」とき。
 * キーに閲覧者のIDを含め、別のアカウントの結果を使い回さない。
 * いつでも古いものとして扱うので、タブを開き直すたびに取り直す（推しや参戦記録の変更を反映するため）。
 */
export function useRelatedUsers(viewerId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [RELATED_USERS_KEY, viewerId],
    queryFn: fetchRelatedUsers,
    enabled: enabled && viewerId !== null,
    staleTime: 0,
    retry: (count, error) =>
      !(error instanceof SignInRequiredError) && count < 2,
  });
}
