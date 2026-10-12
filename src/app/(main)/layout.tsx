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
import { TimelineTabProvider } from "@/features/related-users/TimelineTabs";
import { TagSearch } from "@/features/tags/TagSearch";
import { getViewer } from "@/lib/auth";

/**
 * ツールバーとマップは、ここに置いて常駐させる。
 * レイアウトはページ遷移では再マウントされないので、SVG とズームの状態が保たれる。
 * 16:9 の画面では、左端のツールバー ＋ マップ70% ＋ 右30%（集合写真・現在地・タイムライン）に分ける。
 * スマホ（`wide` に当たらない画面）では縦に積み、ページ全体をスクロールする。
 * 一覧だけをスクロールさせると、マップ・写真・投稿フォームに高さを取られて本文が読めなくなるため。
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
          <TimelineTabProvider>
            <div className="flex min-h-dvh flex-col wide:grid wide:h-dvh wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] wide:grid-rows-[auto_minmax(0,1fr)] wide:md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] wide:lg:grid-cols-[4.5rem_minmax(0,7fr)_minmax(0,3fr)] wide:lg:grid-rows-1">
              <Toolbar islands={islandNames} />
              <section
                aria-label="マップ"
                className="h-[38dvh] min-h-[220px] min-w-0 shrink-0 wide:h-auto wide:min-h-0 wide:shrink"
              >
                <MapCanvas islands={islands} />
              </section>
              <aside className="design-panel flex min-w-0 flex-1 flex-col bg-[var(--ui-panel)] wide:min-h-0">
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
          </TimelineTabProvider>
        </AuthDialogProvider>
      </ViewerProvider>
    </QueryProvider>
  );
}
