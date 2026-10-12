import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { loadIsland } from "@/features/islands/load";
import { Composer } from "@/features/posts/Composer";
import { TimelineTabs } from "@/features/related-users/TimelineTabs";
import { getTimeline } from "@/features/timeline/queries";
import { Timeline } from "@/features/timeline/Timeline";
import { getViewerId } from "@/lib/auth";
import { TIMELINE_PAGE_SIZE } from "@/lib/validation";

type Props = { params: Promise<{ island: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const island = await loadIsland((await params).island);
  if (!island) return { title: "島が見つかりません" };
  const description = island.description ?? `${island.name}のみんなの投稿`;
  return {
    title: island.name,
    description,
    openGraph: { title: island.name, description },
  };
}

/** 島ビュー: 投稿フォーム ＋ 島のグローバルタイムライン（タグなしの投稿も含む全投稿） */
export default async function IslandPage({ params }: Props) {
  await connection();
  const slug = (await params).island;
  const island = await loadIsland(slug);
  if (!island) notFound();

  const viewerId = await getViewerId();
  const initialPage = await getTimeline(await getDb(), {
    scope: { kind: "island", islandId: island.id },
    limit: TIMELINE_PAGE_SIZE,
    viewerId,
  });
  return (
    <TimelineTabs>
      <Composer islandSlug={island.slug} />
      <Timeline
        scope={{ island: island.slug }}
        initialPage={initialPage}
        emptyMessage="この島にはまだ投稿がありません。最初の投稿をしてみよう"
      />
    </TimelineTabs>
  );
}
