import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import {
  createAdminTopicsAction,
  saveAdminIslandAction,
  saveAdminIslandTraitsAction,
  saveAdminTopicAction,
} from "@/features/islands/admin-actions";
import { IslandEditor } from "@/features/islands/IslandEditor";
import { loadIsland } from "@/features/islands/load";
import { TopicEditor } from "@/features/islands/TopicEditor";
import { getMapData } from "@/features/map/data";
import { listTopicTags } from "@/features/tags/queries";
import { getIslandTraits } from "@/features/traits/service";
import { TraitsEditor } from "@/features/traits/TraitsEditor";

export const metadata = { title: "島を編集" };

export default async function AdminIslandPage({
  params,
}: {
  params: Promise<{ island: string }>;
}) {
  await connection();
  const slug = (await params).island;
  const [islands, row] = await Promise.all([getMapData(), loadIsland(slug)]);
  const island = islands.find((item) => item.slug === slug);
  if (!island || !row) notFound();
  const db = await getDb();
  const [topics, traits] = await Promise.all([
    listTopicTags(db, row.id),
    getIslandTraits(db, row.id),
  ]);

  return (
    <main className="mx-auto min-h-dvh max-w-6xl p-6">
      <Link href="/admin" className="text-sm text-sky-700 underline">
        管理画面の島一覧に戻る
      </Link>
      <h1 className="mt-3 text-2xl font-bold">島を編集: {island.name}</h1>
      <p className="mt-2 text-sm text-slate-600">
        メンバータグと話題タグは同じ tags データです。kind が member
        のタグは島内に配置され、kind が topic
        のタグは投稿の話題として使われます。
      </p>
      <IslandEditor
        key={island.id}
        island={island}
        initialDescription={row.description ?? ""}
        allIslands={islands}
        saveAction={saveAdminIslandAction}
      />
      <div className="mt-8 max-w-2xl">
        <TopicEditor
          islandSlug={slug}
          initialTopics={topics}
          saveAction={saveAdminTopicAction}
          createAction={createAdminTopicsAction}
        />
      </div>
      <section className="mt-8 max-w-3xl">
        <h2 className="text-lg font-bold">傾向タグ</h2>
        <p className="mt-1 text-sm text-slate-600">
          左のラベルが 1、右のラベルが 5
          です。選んでいない軸は未評価として保存します。
        </p>
        <TraitsEditor
          key={island.id}
          slug={slug}
          initial={traits}
          saveAction={saveAdminIslandTraitsAction}
        />
      </section>
    </main>
  );
}
