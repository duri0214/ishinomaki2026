import { connection } from "next/server";
import { QueryProvider } from "@/app/providers";
import { AuthDialogProvider } from "@/features/auth/AuthDialog";
import { ViewerProvider } from "@/features/auth/viewer";
import { GroupPhoto, type PhotoIsland } from "@/features/layout/GroupPhoto";
import { Toolbar } from "@/features/layout/Toolbar";
import { Breadcrumb } from "@/features/map/Breadcrumb";
import { getMapData } from "@/features/map/data";
import { MapCanvas } from "@/features/map/MapCanvas";
import type { ProfileIslandOption } from "@/features/profile/ProfileEditor";
import { TagSearch } from "@/features/tags/TagSearch";
import { getViewer } from "@/lib/auth";

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
  const [islands, viewer] = await Promise.all([getMapData(), getViewer()]);
  const islandNames = islands.map(({ slug, name }) => ({ slug, name }));
  const photoIslands: PhotoIsland[] = islands.map(
    ({ slug, name, members, topTags }) => ({
      slug,
      name,
      tags: [
        ...members.map((m) => ({
          normalizedName: m.normalizedName,
          name: m.name,
          kind: "member" as const,
        })),
        ...topTags.map((t) => ({
          normalizedName: t.normalizedName,
          name: t.name,
          kind: "topic" as const,
        })),
      ],
    }),
  );

  const profileOptions: ProfileIslandOption[] = islands.map(
    ({ slug, name, members }) => ({
      slug,
      name,
      members: members.map(({ id, name }) => ({ id, name })),
    }),
  );

  return (
    <QueryProvider>
      <ViewerProvider user={viewer}>
        <AuthDialogProvider profileOptions={profileOptions}>
          <div className="flex h-dvh flex-col min-[551px]:grid min-[551px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[551px]:grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:grid-rows-1">
            {/* 左のツールバーは、狭い画面（上のバー）だけ。PC ではマップの左下にデザインとアカウントを置く */}
            <div className="contents lg:hidden">
              <Toolbar islands={islandNames} />
            </div>
            <section
              aria-label="マップ"
              className="h-[38dvh] min-h-[220px] min-w-0 shrink-0 min-[551px]:h-auto min-[551px]:min-h-0 min-[551px]:shrink"
            >
              <MapCanvas islands={islands} />
            </section>
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#fffcf8]">
              <GroupPhoto islands={photoIslands} />
              <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
                <div className="min-w-0 flex-1">
                  <Breadcrumb islands={islandNames} />
                </div>
                <TagSearch />
              </div>
              <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            </aside>
          </div>
        </AuthDialogProvider>
      </ViewerProvider>
    </QueryProvider>
  );
}
