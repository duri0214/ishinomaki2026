import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db";
import { CreateIslandForm } from "@/features/islands/CreateIslandForm";
import { createIslandAction } from "@/features/islands/dev-actions";
import { listIslands } from "@/features/islands/queries";

export const metadata = { title: "島エディタ" };

/** 島の一覧と作成 */
export default async function DevIslandsPage() {
  // DB を読むので、ビルド時に静的生成しない（レイアウトとページは並行して描画されるため、ここでも指定する）
  await connection();
  const islands = await listIslands(await getDb());
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">島エディタ</h1>
      <p className="mt-1 text-sm text-slate-600">
        島の追加と、島マップ上の配置を調整します（ローカル専用）。
      </p>

      <h2 className="mt-6 font-bold">島の一覧</h2>
      {islands.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">まだ島がありません。</p>
      ) : (
        <ul className="mt-2 divide-y rounded-lg border border-slate-200 bg-white">
          {islands.map((island) => (
            <li key={island.id}>
              <Link
                href={`/dev/islands/${island.slug}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-sky-50"
              >
                <span className="font-bold">{island.name}</span>
                <span className="text-sm text-slate-500">/{island.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-bold">島を作る</h2>
      <CreateIslandForm createAction={createIslandAction} />

      <p className="mt-8 text-sm">
        <Link href="/" className="text-sky-700 underline">
          世界地図へ戻る
        </Link>
      </p>
    </main>
  );
}
