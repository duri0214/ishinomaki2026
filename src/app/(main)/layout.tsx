import { connection } from "next/server";
import { QueryProvider } from "@/app/providers";
import { ViewerProvider } from "@/features/auth/viewer";
import { GroupPhoto } from "@/features/layout/GroupPhoto";
import { Toolbar } from "@/features/layout/Toolbar";
import { Breadcrumb } from "@/features/map/Breadcrumb";
import { getMapData } from "@/features/map/data";
import { MapCanvas } from "@/features/map/MapCanvas";
import { TagSearch } from "@/features/tags/TagSearch";
import { getClerkUserId } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";

/**
 * ツールバーとマップは、ここに置いて常駐させる。
 * レイアウトはページ遷移では再マウントされないので、SVG とズームの状態が保たれる。
 * 16:9 の画面では、左端のツールバー ＋ マップ70% ＋ 右30%（集合写真・現在地・タイムライン）に分ける。
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
  const islandNames = islands.map(({ slug, name }) => ({ slug, name }));

  return (
    <QueryProvider>
      <ViewerProvider
        authEnabled={isClerkConfigured()}
        initialSignedIn={clerkUserId !== null}
      >
        <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[4.5rem_7fr_3fr]">
          <Toolbar islands={islandNames} />
          <section
            aria-label="マップ"
            className="h-[38dvh] min-h-[220px] shrink-0 lg:h-auto lg:min-h-0"
          >
            <MapCanvas islands={islands} />
          </section>
          <aside className="flex min-h-0 flex-1 flex-col bg-[#fffcf8]">
            <GroupPhoto islands={islandNames} />
            <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
              <div className="min-w-0 flex-1">
                <Breadcrumb islands={islandNames} />
              </div>
              <TagSearch />
            </div>
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </aside>
        </div>
      </ViewerProvider>
    </QueryProvider>
  );
}
