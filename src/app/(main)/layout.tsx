import { connection } from "next/server";
import { QueryProvider } from "@/app/providers";
import { ViewerProvider } from "@/features/auth/viewer";
import { Header } from "@/features/layout/Header";
import { getMapData } from "@/features/map/data";
import { MapCanvas } from "@/features/map/MapCanvas";
import { getClerkUserId } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";

/**
 * ヘッダーとマップは、ここに置いて常駐させる。
 * レイアウトはページ遷移では再マウントされないので、SVG とズームの状態が保たれる。
 */
export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // DB を読むので、ビルド時に静的生成しない
  await connection();
  const [islands, clerkUserId] = await Promise.all([
    getMapData(),
    getClerkUserId(),
  ]);

  return (
    <QueryProvider>
      <ViewerProvider
        authEnabled={isClerkConfigured()}
        initialSignedIn={clerkUserId !== null}
      >
        <div className="flex h-dvh flex-col">
          <Header islands={islands.map(({ slug, name }) => ({ slug, name }))} />
          <section
            aria-label="マップ"
            className="h-[55vh] min-h-[240px] shrink-0 border-b border-slate-300"
          >
            <MapCanvas islands={islands} />
          </section>
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </ViewerProvider>
    </QueryProvider>
  );
}
