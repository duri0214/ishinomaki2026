import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getRelatedUsers } from "@/features/related-users/service";
import { getViewerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 閲覧者ごとの結果なので、共有キャッシュにも（ブラウザの）キャッシュにも残さない */
const PRIVATE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/related-users — 閲覧者と共通点のあるユーザー（推しメンバー > ライブ > 推しグループの順）。
 * 対象は常にセッションのユーザー自身で、ユーザーIDなどのパラメータは受け取らない。
 */
export async function GET() {
  const viewerId = await getViewerId();
  if (!viewerId) {
    return NextResponse.json(
      { error: "ログインが必要です" },
      { status: 401, headers: PRIVATE },
    );
  }
  const result = await getRelatedUsers(await getDb(), viewerId);
  return NextResponse.json(result, { headers: PRIVATE });
}
