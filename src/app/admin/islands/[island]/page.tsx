import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import {
  saveAdminIslandAction,
  saveAdminTopicAction,
} from "@/features/islands/admin-actions";
import { IslandEditor } from "@/features/islands/IslandEditor";
import { loadIsland } from "@/features/islands/load";
import { TopicEditor } from "@/features/islands/TopicEditor";
import { getMapData } from "@/features/map/data";
import { listTopicTags } from "@/features/tags/queries";

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
  const topics = await listTopicTags(await getDb(), row.id);

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
        />
      </div>
    </main>
  );
}
