import { assetKey } from "@/features/map/assets";

/**
 * 集合写真（public/photos/）。ファイル名はグループ名を assetKey にしたもの（「M!LK」→「mlk」）。
 * 写真を足したらここにも書く。
 */
const GROUP_PHOTOS: Record<string, string> = {
  arashi: "/photos/arashi.jpg",
  mlk: "/photos/mlk.webp",
  twice: "/photos/twice.jpg",
};

/**
 * 島の集合写真の URL。島の名前（グループ名）か slug で探し、
 * どちらにもなければ `public/photos/<島のslug>.jpg`（なければ表示側で仮の絵になる）。
 * 島がない世界地図では `public/photos/world.jpg`。
 */
export function groupPhoto(island?: { name: string; slug: string }): string {
  if (!island) return "/photos/world.jpg";
  return (
    GROUP_PHOTOS[assetKey(island.name)] ??
    GROUP_PHOTOS[assetKey(island.slug)] ??
    `/photos/${island.slug}.jpg`
  );
}
