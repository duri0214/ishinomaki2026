import { DEFAULT_DESIGN, type Design } from "@/features/design/design";
import manifestJson from "./generated/manifest.json";
import slotsJson from "./generated/slots.json";

/**
 * マップ素材（scripts/map-assets/ で作った manifest.json と slots.json）を型つきで読む。
 * 座標は土台画像に対する割合 (u, v) = (0〜1) で入っているので、toIsland で島の座標にして使う。
 */

/** 見た目のモード（デザイン切替 features/design の値をそのまま使う） */
export type MapMode = Design;

export type SpriteRole =
  | "house-member"
  | "house-cafe"
  | "house-music"
  | "house-shop"
  | "house-cottage"
  | "tree"
  | "stage"
  | "castle"
  | "penlight";

export type SpriteAsset = {
  src: string;
  width: number;
  height: number;
  /** 接地点（画像の幅・高さに対する割合）。この点を地面に置く */
  anchor: number[];
};

type Point = number[];

type BaseImage = {
  src: string;
  width: number;
  height: number;
};

type BaseAsset = BaseImage & {
  palette: string;
  /** モード専用の土台の絵（なければ、どちらのモードでも上の絵） */
  modes?: Partial<Record<MapMode, BaseImage>>;
};

type BaseSlots = {
  plaza: Point;
  /** 島を開いたときに画面いっぱいに映す長方形（中心と、土台画像に対する幅・高さの割合） */
  town: { center: Point; size: number[] };
  castle: { anchor: Point | null; scale: number };
  lots: Point[];
  stage: Point[];
  tree: Point[];
  penlight: Point[];
  /** 街の中心の広場（メンバーのアイコンを並べる楕円。中心と、土台画像に対する横・縦の半径の割合） */
  hub?: { center: Point; radius: number[] };
};

const manifest = manifestJson as unknown as {
  islandSize: number;
  bases: Record<string, BaseAsset>;
  modes: Record<MapMode, Record<string, Record<SpriteRole, SpriteAsset>>>;
  /** レベルごとの島の絵（scripts/map-assets/build_levels.py が書く）。土台 → モード → レベル → 画像 */
  levels?: Record<string, Partial<Record<MapMode, Record<string, string>>>>;
  /** レベルの絵の、土台より上・下の余白（土台の大きさに対する割合） */
  levelFrame?: { top: number; bottom: number };
  /** アイドルの絵（scripts/map-assets/build_idols.py が書く）。グループのキー → メンバーのキー → 画像 */
  idols?: Record<string, Record<string, string>>;
  /** マップの背景（scripts/map-assets/build_backgrounds.py が書く）。モード → 画像 */
  backgrounds?: Partial<Record<MapMode, string>>;
};

const slots = slotsJson as unknown as {
  islandSize: number;
  sizes: Record<
    "house" | "house-member" | "tree" | "stage" | "castle" | "penlight",
    number
  >;
  bases: Record<
    string,
    BaseSlots & { modes?: Partial<Record<MapMode, BaseSlots>> }
  >;
};

/** 使える土台の名前（base-01 など）。島には作成順に割り当てる */
export const BASE_NAMES: readonly string[] = Object.keys(manifest.bases);

/** 素材の表示サイズ（マップ座標での横幅） */
export const SPRITE_SIZES = slots.sizes;

/** 土台画像の、マップ座標での大きさ（layout.ts の ISLAND_RADIUS * 2 と同じ） */
export const BASE_SIZE = slots.islandSize;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 土台画像上の割合 (u, v) を、島の中心を原点としたマップ座標にする */
export function toIsland(p: Point): { x: number; y: number } {
  const [u = 0.5, v = 0.5] = p;
  return { x: round1((u - 0.5) * BASE_SIZE), y: round1((v - 0.5) * BASE_SIZE) };
}

/** 奥（画面の上）ほど少し小さく、手前ほど少し大きく見せる倍率（0.9〜1.1） */
export function depthScale(y: number): number {
  return 0.9 + 0.2 * Math.min(1, Math.max(0, (y + BASE_SIZE / 2) / BASE_SIZE));
}

/**
 * グループ名・メンバー名を、素材のキーにする（build_idols.py と同じ規則）。
 * NFKC で全角・半角をそろえ、小文字にして、文字と数字だけを残す（「M!LK」→「mlk」、「FRUITS ZIPPER」→「fruitszipper」）
 */
export function assetKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * アイドルの絵（public/map/idols/）。島の名前（グループ名）か slug と、メンバー名で探す。
 * まだ用意していなければ null（マップでは頭文字の丸いアイコンになる）
 */
export function idolImage(
  group: { name: string; slug?: string },
  member: string,
): string | null {
  const idols = manifest.idols;
  if (!idols) return null;
  const byGroup =
    idols[assetKey(group.name)] ?? idols[assetKey(group.slug ?? "")];
  return byGroup?.[assetKey(member)] ?? null;
}

/** マップの背景の絵（public/map/background/）。まだ用意していなければ null（海の色と波の模様になる） */
export function backgroundImage(mode: MapMode): string | null {
  return manifest.backgrounds?.[mode] ?? null;
}

/** 名前が分からないときは最初の土台を使う */
function knownBase(name: string | undefined): string {
  return name && name in manifest.bases ? name : (BASE_NAMES[0] as string);
}

/** 土台の絵。mode を渡すと、そのモード専用の絵があればそれを返す */
export function baseAsset(name: string | undefined, mode?: MapMode): BaseAsset {
  const entry = manifest.bases[knownBase(name)] as BaseAsset;
  const variant = mode ? entry.modes?.[mode] : undefined;
  return variant ? { ...entry, ...variant } : entry;
}

/** 家・木などの位置。mode を渡すと、そのモード専用の土台の配置があればそれを返す */
export function baseSlots(name: string | undefined, mode?: MapMode): BaseSlots {
  const entry = slots.bases[knownBase(name)] as BaseSlots & {
    modes?: Partial<Record<MapMode, BaseSlots>>;
  };
  return (mode ? entry.modes?.[mode] : undefined) ?? entry;
}

/** モード × 島の色 × 役割 のスプライト */
export function spriteAsset(
  mode: MapMode,
  palette: string,
  role: SpriteRole,
): SpriteAsset {
  const byPalette = manifest.modes[mode] ?? manifest.modes[DEFAULT_DESIGN];
  const sprites = byPalette[palette] ?? Object.values(byPalette)[0];
  return (sprites as Record<SpriteRole, SpriteAsset>)[role];
}

/**
 * レベルの絵は、城の塔などがはみ出してもよいように土台より上下に広い。
 * 土台の絵と同じ横幅で描き、上に top、下に bottom（土台の大きさに対する割合）だけ広げる。
 */
export const LEVEL_FRAME = {
  top: manifest.levelFrame?.top ?? 0,
  bottom: manifest.levelFrame?.bottom ?? 0,
};

/** この土台・モードにレベルの絵があるか（あれば、ペンライトや城を置く代わりに絵で成長を見せる） */
export function hasLevelImages(
  base: string | undefined,
  mode: MapMode,
): boolean {
  const levels = manifest.levels?.[knownBase(base)]?.[mode];
  return levels !== undefined && Object.keys(levels).length > 0;
}

/**
 * レベルごとの島の絵（世界地図で見せる完成イラスト）。まだ用意していなければ null。
 * レベル1は土台そのもの（lv1 の絵が土台になっている）なので、絵はレベル2から。
 */
export function levelImage(
  base: string | undefined,
  mode: MapMode,
  level: number,
): string | null {
  return manifest.levels?.[knownBase(base)]?.[mode]?.[String(level)] ?? null;
}
