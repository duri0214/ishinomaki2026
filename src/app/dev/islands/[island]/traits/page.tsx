import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { loadIsland } from "@/features/islands/load";
import { saveIslandTraitsAction } from "@/features/traits/dev-actions";
import { getIslandTraits } from "@/features/traits/service";
import { TraitsEditor } from "@/features/traits/TraitsEditor";

export const metadata = { title: "傾向タグの編集" };

/** 島(グループ)の傾向タグを 1〜5 で設定するデバッグ用ページ */
export default async function DevTraitsPage({
  params,
}: {
  params: Promise<{ island: string }>;
}) {
  await connection();
  const slug = (await params).island;
  const island = await loadIsland(slug);
  if (!island) notFound();
  const traits = await getIslandTraits(await getDb(), island.id);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <p className="text-sm">
        <Link href="/dev/islands" className="text-sky-700 underline">
          ← 島の一覧
        </Link>
        <span className="mx-2 text-slate-400">|</span>
        <Link href={`/dev/islands/${slug}`} className="text-sky-700 underline">
          島の編集
        </Link>
      </p>
      <h1 className="mt-2 text-xl font-bold">傾向タグの編集: {island.name}</h1>
      <p className="mt-1 text-sm text-slate-600">
        左のラベルが 1、右のラベルが 5 です（ローカル専用）。
      </p>
      <TraitsEditor
        key={island.id}
        slug={slug}
        initial={traits}
        saveAction={saveIslandTraitsAction}
      />
    </main>
  );
}
