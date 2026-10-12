import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IslandBasePanel } from "@/features/islands/IslandBasePanel";
import { IslandEditor } from "@/features/islands/IslandEditor";
import { loadIsland } from "@/features/islands/load";
import { getMapData } from "@/features/map/data";

export const metadata = { title: "島の編集" };

/**
 * 島の編集。URL の [island] パラメータが、プレビューの MapCanvas が見る島にもなる。
 * マップのデータは本番と同じ getMapData()（5分キャッシュの上位20件を含む）を使う。
 */
export default async function DevIslandPage({
  params,
}: {
  params: Promise<{ island: string }>;
}) {
  await connection();
  const slug = (await params).island;
  const islands = await getMapData();
  const island = islands.find((i) => i.slug === slug);
  const row = await loadIsland(slug);
  if (!island || !row) notFound();

  return (
    <main className="mx-auto max-w-6xl p-4">
      <p className="text-sm">
        <Link href="/dev/islands" className="text-sky-700 underline">
          ← 島の一覧
        </Link>
        <span className="mx-2 text-slate-400">|</span>
        <Link href={`/i/${slug}`} className="text-sky-700 underline">
          島ビューを開く
        </Link>
        <span className="mx-2 text-slate-400">|</span>
        <Link href="/" className="text-sky-700 underline">
          世界地図を開く
        </Link>
      </p>
      <h1 className="mt-2 text-xl font-bold">島の編集: {island.name}</h1>
      <IslandBasePanel slug={slug} base={island.base} />
      <IslandEditor
        key={island.id}
        island={island}
        initialDescription={row.description ?? ""}
        allIslands={islands}
      />
    </main>
  );
}
