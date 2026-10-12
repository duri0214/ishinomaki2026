import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getReplies } from "@/features/timeline/queries";
import { getViewerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/posts/:postId/replies — 投稿への返信を古い順に返す */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const parsed = z.uuid().safeParse((await params).postId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "投稿の指定が不正です" },
      { status: 400 },
    );
  }
  const replies = await getReplies(
    await getDb(),
    parsed.data,
    await getViewerId(),
  );
  return NextResponse.json(
    { replies },
    { headers: { "Cache-Control": "no-store" } },
  );
}
