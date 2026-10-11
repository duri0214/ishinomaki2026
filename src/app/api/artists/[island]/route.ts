import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getArtistProfile } from "@/features/artists/queries";
import { islandSlugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** ログイン不要。DBの接続情報やプロフィール以外の列は返さない。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ island: string }> },
) {
  const parsed = islandSlugSchema.safeParse((await params).island);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "アーティストの指定が不正です" },
      { status: 400 },
    );
  }
  try {
    const profile = await getArtistProfile(await getDb(), parsed.data);
    if (!profile) {
      return NextResponse.json(
        { error: "アーティストが見つかりません" },
        { status: 404 },
      );
    }
    return NextResponse.json({ profile });
  } catch {
    // 接続文字列などを含むDBのエラーはレスポンスに載せない。
    return NextResponse.json(
      { error: "アーティスト情報を読み込めませんでした" },
      { status: 503 },
    );
  }
}
