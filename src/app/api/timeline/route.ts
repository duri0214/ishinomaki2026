import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getIslandBySlug } from "@/features/islands/queries";
import { getTagByNormalizedName } from "@/features/tags/queries";
import { getTimeline, type TimelineScope } from "@/features/timeline/queries";
import { getViewerId } from "@/lib/auth";
import { decodeCursor } from "@/lib/cursor";
import { timelineQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/timeline?island=&tag=&cursor=&limit= — 3種類（全島 / 島 / 島＋タグ）のタイムライン */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = timelineQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "リクエストが不正です" },
      { status: 400 },
    );
  }
  const { island: slug, tag, cursor, limit } = parsed.data;
  const db = await getDb();

  let scope: TimelineScope = { kind: "all" };
  if (slug) {
    const island = await getIslandBySlug(db, slug);
    if (!island) {
      return NextResponse.json(
        { error: "島が見つかりません" },
        { status: 404 },
      );
    }
    scope = { kind: "island", islandId: island.id };
    if (tag) {
      const row = await getTagByNormalizedName(db, island.id, tag);
      // まだ誰も使っていないタグは、投稿0件として返す
      if (!row) return NextResponse.json({ posts: [], nextCursor: null });
      scope = { kind: "tag", islandId: island.id, tagId: row.id };
    }
  }

  const page = await getTimeline(db, {
    scope,
    cursor: cursor ? (decodeCursor(cursor) ?? undefined) : undefined,
    limit,
    viewerId: await getViewerId(),
  });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
