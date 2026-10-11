import { TOP_TAG_COUNT } from "@/features/tags/constants";
import { normalizeTagName } from "@/features/tags/normalize";
import { decodeRouteParam } from "@/lib/route-params";
import type {
  Camera,
  MapFocus,
  MapHouse,
  MapIslandData,
  Viewport,
} from "./types";

/** 島の最大半径（島の中心を原点とした座標での大きさ）。世界地図の座標も同じ単位。島同士はこの2倍以上離す */
export const ISLAND_RADIUS = 345;
/** 中央の広場の半径。メンバーの家はこの中に置く */
export const PLAZA_RADIUS = 85;
/** 家の絵の大きさ（幅）。ラベルはこの下に付く */
export const HOUSE_SIZE = 56;

const INNER_RING = { radius: 140, count: 8, startDeg: -90 };
const OUTER_RING = { radius: 225, count: 12, startDeg: -75 };

const round1 = (n: number) => Math.round(n * 10) / 10;

function polar(radius: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: round1(Math.cos(rad) * radius),
    y: round1(Math.sin(rad) * radius),
  };
}

/**
 * 話題タグの家を置く固定スロット（20個）。順位が高いほど内側のリングに置く。
 * 外側のリングは半歩ずらして、家同士が重ならないようにしている。
 */
export const HOUSE_SLOTS: readonly { x: number; y: number }[] = [
  ...Array.from({ length: INNER_RING.count }, (_, i) =>
    polar(
      INNER_RING.radius,
      INNER_RING.startDeg + (360 / INNER_RING.count) * i,
    ),
  ),
  ...Array.from({ length: OUTER_RING.count }, (_, i) =>
    polar(
      OUTER_RING.radius,
      OUTER_RING.startDeg + (360 / OUTER_RING.count) * i,
    ),
  ),
];

if (HOUSE_SLOTS.length !== TOP_TAG_COUNT) {
  throw new Error("スロット数は上位タグの件数と一致している必要があります");
}

/**
 * メンバーの家の既定の位置（島エディタで位置を決めるまでの仮置き）。
 * 1人なら中央、複数なら広場の中で円形に並べる。人数が多いときは外側にもう1周する。
 */
export function defaultMemberPosition(
  index: number,
  count: number,
): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const innerCapacity = 6;
  if (count <= innerCapacity + 1) {
    return polar(46, -90 + (360 / count) * index);
  }
  // 多いときは、内側に最大6人、残りを外側に並べる
  if (index < innerCapacity) {
    return polar(34, -90 + (360 / innerCapacity) * index);
  }
  const outerCount = count - innerCapacity;
  return polar(
    66,
    -90 + 180 / outerCount + (360 / outerCount) * (index - innerCapacity),
  );
}

/** 広場の外に出ないよう、座標を広場の半径に収める（島エディタで保存する値の検証にも使う） */
export function clampToPlaza(p: { x: number; y: number }): {
  x: number;
  y: number;
} {
  const limit = PLAZA_RADIUS;
  const d = Math.hypot(p.x, p.y);
  if (d <= limit) return { x: round1(p.x), y: round1(p.y) };
  const s = limit / d;
  return { x: round1(p.x * s), y: round1(p.y * s) };
}

/** 島の中の家（メンバー＋話題タグの上位20件）の配置を求める */
export function buildHouses(island: MapIslandData): MapHouse[] {
  const members: MapHouse[] = island.members.map((m, i) => {
    const pos = m.position
      ? clampToPlaza(m.position)
      : defaultMemberPosition(i, island.members.length);
    return {
      tagId: m.id,
      name: m.name,
      normalizedName: m.normalizedName,
      imageUrl: m.imageUrl,
      kind: "member",
      postCount: null,
      rank: null,
      x: pos.x,
      y: pos.y,
    };
  });
  const topics: MapHouse[] = island.topTags
    .slice(0, HOUSE_SLOTS.length)
    .map((t, i) => {
      // 上位に満たないときは、後ろのスロットが空くだけ（順位 i+1 はスロット i）
      const slot = HOUSE_SLOTS[i] as { x: number; y: number };
      return {
        tagId: t.id,
        name: t.name,
        normalizedName: t.normalizedName,
        imageUrl: t.imageUrl,
        kind: "topic",
        postCount: t.postCount,
        rank: i + 1,
        x: slot.x,
        y: slot.y,
      };
    });
  return [...members, ...topics];
}

/** URLのパラメータから、マップがどこにズームするかを決める */
export function resolveFocus(
  islands: readonly MapIslandData[],
  params: { island?: string; tag?: string },
): MapFocus {
  const island = islands.find((i) => i.slug === params.island);
  if (!island) return { kind: "world" };
  if (params.tag) {
    const normalizedName = normalizeTagName(decodeRouteParam(params.tag));
    // 上位20件（とメンバー）以外のタグは家がないので、島のままにする
    const house = buildHouses(island).find(
      (h) => h.normalizedName === normalizedName,
    );
    if (house) return { kind: "house", slug: island.slug, normalizedName };
  }
  return { kind: "island", slug: island.slug };
}

export function focusKey(focus: MapFocus): string {
  switch (focus.kind) {
    case "world":
      return "world";
    case "island":
      return `island:${focus.slug}`;
    case "house":
      return `house:${focus.slug}:${focus.normalizedName}`;
  }
}

/** 世界地図から遷移先のフォーカスを求める（クリックしてすぐズームを始めるために使う） */
export function focusForPath(
  islands: readonly MapIslandData[],
  path: string,
): MapFocus {
  const m = path.match(/^\/i\/([^/]+)(?:\/t\/([^/]+))?\/?$/);
  if (!m) return { kind: "world" };
  return resolveFocus(islands, { island: m[1], tag: m[2] });
}

const MARGIN = 1.15;

/** カメラが見る範囲の中心と、画面に収めるときの拡大率 */
function fitScale(view: Viewport, width: number, height: number): number {
  return Math.min(view.width / width, view.height / height);
}

function centered(view: Viewport, cx: number, cy: number, k: number): Camera {
  return {
    x: round1(view.width / 2 - cx * k),
    y: round1(view.height / 2 - cy * k),
    k,
  };
}

const MIN_K = 0.05;
const MAX_K = 12;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** フォーカスに対応する目標のカメラ位置 */
export function cameraFor(
  focus: MapFocus,
  islands: readonly MapIslandData[],
  view: Viewport,
): Camera {
  const safe: Viewport = {
    width: Math.max(view.width, 1),
    height: Math.max(view.height, 1),
  };
  const worldCamera = (): Camera => {
    if (islands.length === 0) return centered(safe, 0, 0, 1);
    const xs = islands.flatMap((i) => [
      i.worldX - ISLAND_RADIUS,
      i.worldX + ISLAND_RADIUS,
    ]);
    const ys = islands.flatMap((i) => [
      i.worldY - ISLAND_RADIUS,
      i.worldY + ISLAND_RADIUS,
    ]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const k = clampK(
      fitScale(safe, (maxX - minX) * MARGIN, (maxY - minY) * MARGIN),
    );
    return centered(safe, (minX + maxX) / 2, (minY + maxY) / 2, k);
  };
  if (focus.kind === "world") return worldCamera();

  const island = islands.find((i) => i.slug === focus.slug);
  if (!island) return worldCamera();
  const islandK = clampK(
    fitScale(safe, ISLAND_RADIUS * 2 * MARGIN, ISLAND_RADIUS * 2 * MARGIN),
  );
  if (focus.kind === "island") {
    return centered(safe, island.worldX, island.worldY, islandK);
  }
  const house = buildHouses(island).find(
    (h) => h.normalizedName === focus.normalizedName,
  );
  if (!house) return centered(safe, island.worldX, island.worldY, islandK);
  // 家が画面の高さの 1/4 ほどになる拡大率（島全体が見えるときの約4倍）
  const houseK = clampK(
    Math.max(islandK * 3.5, (safe.height * 0.28) / HOUSE_SIZE),
  );
  return centered(
    safe,
    island.worldX + house.x,
    island.worldY + house.y,
    houseK,
  );
}
