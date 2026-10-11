import type { MemberTag, RankedTag } from "@/features/tags/queries";

/** マップの描画に必要な島のデータ（レイアウトのServer Componentで取得して渡す） */
export type MapIslandData = {
  id: string;
  slug: string;
  name: string;
  worldX: number;
  worldY: number;
  imageUrl: string | null;
  /** メンバータグ（島の中央の広場に置く） */
  members: MemberTag[];
  /** 話題タグの上位20件（直近7日の投稿数順） */
  topTags: RankedTag[];
};

/** 島の中心を原点とした座標での、家1軒の配置 */
export type MapHouse = {
  tagId: string;
  name: string;
  normalizedName: string;
  imageUrl: string | null;
  kind: "member" | "topic";
  /** 話題タグは直近7日の投稿数。メンバーは null（集計しない） */
  postCount: number | null;
  /** 話題タグの順位（1始まり）。メンバーは null */
  rank: number | null;
  x: number;
  y: number;
};

export type MapFocus =
  | { kind: "world" }
  | { kind: "island"; slug: string }
  | { kind: "house"; slug: string; normalizedName: string };

export type Viewport = { width: number; height: number };

/** d3-zoom の変換と同じ意味: 画面座標 = 世界座標 * k + (x, y) */
export type Camera = { x: number; y: number; k: number };
