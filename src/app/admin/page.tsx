import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db";
import { createAdminIslandAction } from "@/features/islands/admin-actions";
import { CreateIslandForm } from "@/features/islands/CreateIslandForm";
import { listIslands } from "@/features/islands/queries";

export const metadata = { title: "管理画面" };

export default async function AdminPage() {
  await connection();
  const islands = await listIslands(await getDb());
  return (
    <main className="mx-auto min-h-dvh max-w-4xl p-6">
      <Link href="/" className="text-sm text-sky-700 underline">
        世界マップに戻る
      </Link>
      <h1 className="mt-3 text-2xl font-bold">管理画面</h1>
      <p className="mt-2 text-slate-600">
        島の名前や説明、マップ上の位置を登録・修正し、島に所属するアイドルを表すメンバータグと話題タグを続けて整備できます。
      </p>

      <section className="mt-8">
        <h2 className="font-bold">島を選ぶ</h2>
        {islands.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">島はまだありません。</p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border border-slate-200 bg-white">
            {islands.map((island) => (
              <li key={island.id}>
                <Link
                  href={`/admin/islands/${island.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-sky-50"
                >
                  <span className="font-bold">{island.name}</span>
                  <span className="text-sm text-slate-500">/{island.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold">島を追加</h2>
        <p className="mt-1 text-sm text-slate-600">
          追加した島は続けてメンバータグと話題タグを設定できます。
        </p>
        <CreateIslandForm
          createAction={createAdminIslandAction}
          destination="/admin/islands"
        />
      </section>
    </main>
  );
}
