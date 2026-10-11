import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { loadIsland } from "@/features/islands/load";
import { Composer } from "@/features/posts/Composer";
import { getTagByNormalizedName } from "@/features/tags/queries";
import { getTimeline } from "@/features/timeline/queries";
import { Timeline } from "@/features/timeline/Timeline";
import { getViewerId } from "@/lib/auth";
import { decodeRouteParam } from "@/lib/route-params";
import { TIMELINE_PAGE_SIZE, tagParamSchema } from "@/lib/validation";

type Props = { params: Promise<{ island: string; tag: string }> };

function parseTag(raw: string): string | undefined {
  const parsed = tagParamSchema.safeParse(decodeRouteParam(raw));
  return parsed.success ? parsed.data : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { island: slug, tag: rawTag } = await params;
  const island = await loadIsland(slug);
  const normalized = parseTag(rawTag);
  if (!island || !normalized) return { title: "タグが見つかりません" };
  const row = await getTagByNormalizedName(
    await getDb(),
    island.id,
    normalized,
  );
  const name = row?.name ?? normalized;
  return {
    title: `#${name} - ${island.name}`,
    description: `${island.name}の #${name} の投稿`,
  };
}

/**
 * 家にズームした状態: 投稿フォーム（本文の末尾に ` #タグ名` を入力済み） ＋ タグで絞ったタイムライン。
 * 上位20件以外のタグでも開ける（その場合、マップは島のままでタイムラインだけ切り替わる）。
 */
export default async function TagPage({ params }: Props) {
  await connection();
  const { island: slug, tag: rawTag } = await params;
  const island = await loadIsland(slug);
  const normalized = parseTag(rawTag);
  if (!island || !normalized) notFound();

  const db = await getDb();
  const tag = await getTagByNormalizedName(db, island.id, normalized);
  // まだ誰も使っていないタグは、投稿0件のタイムラインとして開く
  const initialPage = tag
    ? await getTimeline(db, {
        scope: { kind: "tag", islandId: island.id, tagId: tag.id },
        limit: TIMELINE_PAGE_SIZE,
        viewerId: await getViewerId(),
      })
    : { posts: [], nextCursor: null };
  const displayName = tag?.name ?? normalized;
  const key = `${island.slug}:${normalized}`;

  return (
    <>
      <Composer
        key={`composer:${key}`}
        islandSlug={island.slug}
        initialText={` #${displayName}`}
      />
      <Timeline
        key={`timeline:${key}`}
        scope={{ island: island.slug, tag: normalized }}
        initialPage={initialPage}
        emptyMessage={`#${displayName} の投稿はまだありません`}
      />
    </>
  );
}
