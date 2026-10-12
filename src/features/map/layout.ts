import { normalizeTagName } from "@/features/tags/normalize";
import { decodeRouteParam } from "@/lib/route-params";
import {
  BASE_SIZE,
  baseSlots,
  idolImage,
  type MapMode,
  SPRITE_SIZES,
  type SpriteRole,
  toIsland,
} from "./assets";
import type {
  Camera,
  MapFocus,
  MapHouse,
  MapIslandData,
  MapMember,
  Viewport,
} from "./types";

/** 島の最大半径（島の中心を原点とした座標での大きさ）。世界地図の座標も同じ単位。島同士はこの2倍以上離す */
export const ISLAND_RADIUS = 345;
/** 中央の広場の半径。メンバーの家はこの中に置く */
export const PLAZA_RADIUS = 85;
/** 家の絵の大きさ（幅）。カメラの拡大率の計算にも使う */
export const HOUSE_SIZE = SPRITE_SIZES.house;
/** マップに家を建てる話題タグの件数（直近7日の投稿数の上位） */
export const MAP_TOPIC_HOUSES = 10;

if (BASE_SIZE !== ISLAND_RADIUS * 2) {
  throw new Error(
    "slots.json の islandSize と ISLAND_RADIUS * 2 は一致している必要があります",
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function polar(radius: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: round1(Math.cos(rad) * radius),
    y: round1(Math.sin(rad) * radius),
  };
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

/** 検索結果の1件（タグ検索 API の結果と同じ形） */
export type SearchedTag = {
  name: string;
  normalizedName: string;
  kind: "member" | "topic";
};

/**
 * 島の家の配置を求める。家は10軒（区画は slots.json の lots。中央の広場のまわりに、12時の位置から時計回り）。
 * - ふだん: 直近7日の投稿数の上位10件（topTags）
 * - タグを検索中（searchResults あり）: 検索結果（話題タグ）が同じ10か所に入れ替わる
 * - focusTag（URL で開いているタグ）に家がないときは、11か所目にその家を建てる
 * メンバーは家にしない（中央の広場のアイコン。buildMembers）
 */
export function buildHouses(
  island: MapIslandData,
  focusTag?: string,
  searchResults?: readonly SearchedTag[],
  mode?: MapMode,
): MapHouse[] {
  const lots = baseSlots(island.base, mode).lots.map(toIsland);
  const known = (normalizedName: string) =>
    island.topTags.find((t) => t.normalizedName === normalizedName);
  const memberOf = (normalizedName: string) =>
    island.members.find((m) => m.normalizedName === normalizedName);
  const toHouse = (
    tag: { name: string; normalizedName: string; kind: "member" | "topic" },
    lot: { x: number; y: number },
    rank: number | null,
  ): MapHouse => {
    const ranked = known(tag.normalizedName);
    const member = memberOf(tag.normalizedName);
    return {
      tagId:
        ranked?.id ??
        member?.id ??
        `search:${island.slug}:${tag.normalizedName}`,
      name: ranked?.name ?? member?.name ?? tag.name,
      normalizedName: tag.normalizedName,
      imageUrl: ranked?.imageUrl ?? member?.imageUrl ?? null,
      kind: tag.kind,
      postCount: tag.kind === "member" ? null : (ranked?.postCount ?? null),
      rank,
      x: lot.x,
      y: lot.y,
    };
  };

  // 検索結果のメンバーは、家ではなく広場のアイコンを光らせる
  const searchedTopics = (searchResults ?? []).filter(
    (t) => t.kind !== "member" && !memberOf(t.normalizedName),
  );
  const searching = Boolean(searchResults && searchResults.length > 0);
  const shown: {
    name: string;
    normalizedName: string;
    kind: "member" | "topic";
  }[] = searching
    ? searchedTopics.slice(0, MAP_TOPIC_HOUSES)
    : island.topTags
        .slice(0, MAP_TOPIC_HOUSES)
        .map((t) => ({ ...t, kind: "topic" as const }));
  const houses = shown
    .slice(0, lots.length)
    .map((tag, i) =>
      toHouse(
        tag,
        lots[i] as { x: number; y: number },
        searching ? null : i + 1,
      ),
    );

  const spare = lots[houses.length];
  if (
    focusTag &&
    spare &&
    !memberOf(focusTag) &&
    !houses.some((h) => h.normalizedName === focusTag)
  ) {
    houses.push(
      toHouse(
        { name: focusTag, normalizedName: focusTag, kind: "topic" },
        spare,
        null,
      ),
    );
  }
  return houses;
}

/** 街の中心の広場（メンバーのアイコンを並べる楕円）。slots.json に hub がない土台は、街の長方形から決める */
export function hubOf(
  island: MapIslandData,
  mode?: MapMode,
): { x: number; y: number; rx: number; ry: number } {
  const slots = baseSlots(island.base, mode);
  const center = toIsland(
    slots.hub?.center ?? slots.town?.center ?? [0.5, 0.5],
  );
  const [w = 0.4, h = 0.35] = slots.town?.size ?? [];
  const [rx = w * 0.17, ry = h * 0.17] = slots.hub?.radius ?? [];
  return { x: center.x, y: center.y, rx: rx * BASE_SIZE, ry: ry * BASE_SIZE };
}

/** n 個の丸を、半径 r の円の内側に輪にして並べるときの丸の直径（隣どうしと、外の円からはみ出さない） */
function ringDiameter(count: number, r: number): number {
  if (count <= 1) return r * 1.2;
  const s = Math.min(2 * Math.sin(Math.PI / count), 2);
  return (s * r) / (1 + s / 2);
}

/**
 * メンバーのアイコンの配置（島の中央の広場）。
 * 人数に合わせて、輪に並べるか、1人目を真ん中にして残りを輪にするか、アイコンが大きくなる方を選ぶ。
 * 輪は12時の位置から時計回り（メンバーの登録順）
 */
export function buildMembers(
  island: MapIslandData,
  mode?: MapMode,
): MapMember[] {
  const members = island.members;
  const n = members.length;
  if (n === 0) return [];
  const hub = hubOf(island, mode);
  const r = Math.min(hub.rx, hub.ry);
  const ringOnly = ringDiameter(n, r);
  // 真ん中に1人＋残りを輪に（真ん中と輪の間も重ならないよう、直径は輪の半径以下）
  const withCenter = n >= 3 ? Math.min(ringDiameter(n - 1, r), r / 1.5) : 0;
  const centered = withCenter > ringOnly;
  const size = round1((centered ? withCenter : ringOnly) * 0.92);
  const ringCount = centered ? n - 1 : n;
  const ringX = Math.max(0, hub.rx - size / 2 - size * 0.04);
  const ringY = Math.max(0, hub.ry - size / 2 - size * 0.04);
  return members.map((m, index) => {
    const i = centered ? index - 1 : index;
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ringCount);
    const inCenter = (centered && index === 0) || n === 1;
    return {
      tagId: m.id,
      name: m.name,
      normalizedName: m.normalizedName,
      imageUrl: m.imageUrl ?? idolImage(island, m.name),
      x: round1(inCenter ? hub.x : hub.x + Math.cos(angle) * ringX),
      y: round1(inCenter ? hub.y : hub.y + Math.sin(angle) * ringY),
      size,
    };
  });
}

/** タグの場所（メンバーなら広場のアイコンの中心、話題タグなら家の接地点）。なければ null */
function spotOf(
  island: MapIslandData,
  normalizedName: string,
  mode?: MapMode,
): { x: number; y: number; member: boolean } | null {
  const member = buildMembers(island, mode).find(
    (m) => m.normalizedName === normalizedName,
  );
  if (member) return { x: member.x, y: member.y, member: true };
  const house = buildHouses(island, normalizedName, undefined, mode).find(
    (h) => h.normalizedName === normalizedName,
  );
  return house ? { x: house.x, y: house.y, member: false } : null;
}

/**
 * 家の大きさの倍率。街の長方形が広い土台では、そのぶん家も大きくする
 * （どの島を開いても、画面での家の大きさと間隔がだいたい同じになるように）
 */
export function houseScale(island: MapIslandData, mode?: MapMode): number {
  const width =
    (baseSlots(island.base, mode).town?.size[0] ?? 0.25) * BASE_SIZE;
  return Math.min(1.3, Math.max(0.5, width / 215));
}

/** 投稿数の上位が MAP_TOPIC_HOUSES 件に満たないときは、新しいタグで埋める（家が10軒になるように） */
export function fillTopTags<T extends { id: string }>(
  ranked: T[],
  newest: T[],
): T[] {
  if (ranked.length >= MAP_TOPIC_HOUSES) return ranked;
  const seen = new Set(ranked.map((t) => t.id));
  const extra = newest.filter((t) => !seen.has(t.id));
  return [...ranked, ...extra].slice(
    0,
    Math.max(ranked.length, MAP_TOPIC_HOUSES),
  );
}

/**
 * 島のレベルが上がる島民数（フォロー数）。[レベル1, レベル2, …] の下限。
 * レベルの絵（public/map/levels/）がある島は、世界地図でその絵に切り替わる
 */
export const LEVEL_THRESHOLDS = [0, 10, 100, 1000, 10000] as const;

/** 島民数から島のレベル（1〜5）を求める */
export function islandLevel(population: number): number {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((min, i) => {
    if (population >= min) level = i + 1;
  });
  return level;
}

/** 島民数から、成長オブジェクトの数を求める（1の位＝ペンライト、10の位＝桜、100の位＝ステージ、1000人〜城） */
export function growthCounts(population: number) {
  const n = Math.max(0, Math.floor(population));
  return {
    penlight: n % 10,
    tree: Math.floor(n / 10) % 10,
    stage: Math.floor(n / 100) % 10,
    castle: n >= 1000,
  };
}

export type GrowthObject = {
  key: string;
  role: Extract<SpriteRole, "penlight" | "tree" | "stage" | "castle">;
  x: number;
  y: number;
  /** 草地が狭くて城が入らない土台では、城を小さくする */
  scale: number;
};

/** 島民数に応じた成長オブジェクトの配置。置き場所が足りないときは、ある分だけ置く */
export function buildGrowth(
  island: MapIslandData,
  population: number,
  mode?: MapMode,
): GrowthObject[] {
  const slots = baseSlots(island.base, mode);
  const counts = growthCounts(population);
  const take = (role: "stage" | "tree" | "penlight", count: number) =>
    slots[role].slice(0, count).map((p, i) => ({
      key: `${role}-${i}`,
      role,
      ...toIsland(p),
      scale: 1,
    }));
  const items: GrowthObject[] = [
    ...take("stage", counts.stage),
    ...take("tree", counts.tree),
    ...take("penlight", counts.penlight),
  ];
  if (counts.castle && slots.castle.anchor) {
    items.push({
      key: "castle",
      role: "castle",
      ...toIsland(slots.castle.anchor),
      scale: slots.castle.scale,
    });
  }
  return items;
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
    // メンバーなら広場のアイコンへ、上位以外のタグでも空き区画に家を建ててその家へ寄る
    if (spotOf(island, normalizedName)) {
      return { kind: "house", slug: island.slug, normalizedName };
    }
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

/** カメラの拡大率の下限・上限（ボタン・ホイール・ピンチでも同じ）。上限は家やメンバーのアイコンに寄ってから、さらに2回ほど拡大できるくらい */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 24;
const clampK = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** フォーカスに対応する目標のカメラ位置 */
export function cameraFor(
  focus: MapFocus,
  islands: readonly MapIslandData[],
  view: Viewport,
  mode?: MapMode,
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
  // 島全体が収まる拡大率（島が見つからないときなどの基準）
  const fitIslandK = clampK(
    fitScale(safe, ISLAND_RADIUS * 2 * MARGIN, ISLAND_RADIUS * 2 * MARGIN),
  );
  // 島を開いたときは、街の長方形が画面いっぱいになるまで寄る（崖や島の端は映さない）。
  // ただし画面の縦横比が極端で家が切れるときは、家が全部入るところまで引く
  const town = townView(island, mode);
  const coverK = Math.max(safe.width / town.width, safe.height / town.height);
  const housesK = fitScale(safe, town.housesWidth, town.housesHeight);
  const islandK = clampK(Math.max(fitIslandK * 1.6, Math.min(coverK, housesK)));
  const islandCamera = () =>
    centered(safe, island.worldX + town.cx, island.worldY + town.cy, islandK);
  if (focus.kind === "island") return islandCamera();
  const spot = spotOf(island, focus.normalizedName, mode);
  if (!spot) return islandCamera();
  // 家（メンバーのアイコン）に寄る（島を開いたときの1.6倍）。家は絵が接地点より上にあるので、少し上を中央にする
  const houseK = clampK(islandK * 1.6);
  return centered(
    safe,
    island.worldX + spot.x,
    island.worldY + spot.y - (spot.member ? 0 : HOUSE_SIZE * 0.5),
    houseK,
  );
}

/** 島を開いたときに見せる範囲（slots.json の街の長方形）と、家が全部入る範囲 */
function townView(island: MapIslandData, mode?: MapMode) {
  const slots = baseSlots(island.base, mode);
  const center = toIsland(slots.town?.center ?? [0.5, 0.5]);
  const [w = 0.4, h = 0.35] = slots.town?.size ?? [];
  const lots = slots.lots.map(toIsland);
  const xs = lots.map((p) => Math.abs(p.x - center.x));
  const ys = lots.map((p) => Math.abs(p.y - center.y));
  const pad = HOUSE_SIZE * 1.5 * houseScale(island, mode); // 家の絵とラベルの分（家の大きさに合わせる）
  return {
    cx: center.x,
    cy: center.y,
    width: w * BASE_SIZE,
    height: h * BASE_SIZE,
    housesWidth: (Math.max(0, ...xs) + pad) * 2,
    housesHeight: (Math.max(0, ...ys) + pad) * 2,
  };
}
