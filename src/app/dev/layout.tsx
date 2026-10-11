import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isDevEditorEnabled } from "@/lib/dev-only";

/** 島エディタはローカル専用。本番（Vercel の Preview を含む）では 404 を返す */
export default async function DevLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  if (!isDevEditorEnabled()) notFound();
  return (
    <div className="min-h-dvh">
      <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
        開発専用の島エディタです（本番では表示されません）
      </div>
      {children}
    </div>
  );
}
