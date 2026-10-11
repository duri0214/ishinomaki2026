import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getIslandBySlug } from "@/features/islands/queries";
import { searchTags } from "@/features/tags/queries";
import { tagSearchQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/tags/search?island=&q= — 島内のタグ検索（ヘッダーの検索と、投稿フォームの入力補助） */
export async function GET(request: NextRequest) {
  const parsed = tagSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "リクエストが不正です" },
      { status: 400 },
    );
  }
  const { island: slug, q, limit } = parsed.data;
  const db = await getDb();
  const island = await getIslandBySlug(db, slug);
  if (!island) {
    return NextResponse.json({ error: "島が見つかりません" }, { status: 404 });
  }
  const results = await searchTags(db, island.id, q, limit);
  return NextResponse.json({ tags: results });
}
