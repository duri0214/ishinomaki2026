import { connection } from "next/server";
import { isAdminUsername } from "@/lib/admin";
import { getViewer } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const viewer = await getViewer();
  if (!isAdminUsername(viewer?.username)) {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl p-6">
        <h1 className="text-xl font-bold">管理画面</h1>
        <p className="mt-3 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
          ユーザー名に admin を含むアカウントで利用できます。
        </p>
      </main>
    );
  }
  return children;
}
