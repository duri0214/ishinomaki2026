import {
  depthScale,
  type MapMode,
  SPRITE_SIZES,
  type SpriteRole,
  spriteAsset,
} from "./assets";
import { Sprite } from "./Sprite";
import { hashString } from "./shapes";
import type { MapHouse } from "./types";

const MAX_LABEL_CHARS = 9;

/** 話題タグの家の種類。タグIDから決めるので、同じタグはいつも同じ家になる */
const TOPIC_ROLES: readonly SpriteRole[] = [
  "house-cafe",
  "house-music",
  "house-shop",
  "house-cottage",
];

function shortLabel(name: string): string {
  const chars = Array.from(name);
  return chars.length > MAX_LABEL_CHARS
    ? `${chars.slice(0, MAX_LABEL_CHARS - 1).join("")}…`
    : name;
}

/** メンバーは星の家、話題タグは4種類のどれか */
export function houseRole(house: Pick<MapHouse, "kind" | "tagId">): SpriteRole {
  if (house.kind === "member") return "house-member";
  return TOPIC_ROLES[
    hashString(house.tagId) % TOPIC_ROLES.length
  ] as SpriteRole;
}

/** 家の横幅（マップ座標）。手前ほど少し大きく、話題タグの1〜3位は少し大きく。scale は島ごとの倍率 */
export function houseWidth(house: MapHouse, scale = 1): number {
  const base =
    house.kind === "member" ? SPRITE_SIZES["house-member"] : SPRITE_SIZES.house;
  const top3 = house.rank !== null && house.rank <= 3 ? 1.12 : 1;
  return base * top3 * scale * depthScale(house.y);
}

/** ラベルの幅の見積もり（全角は1文字分、半角は0.6文字分） */
export function textWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce(
    (sum, ch) => sum + (ch.charCodeAt(0) < 0x2000 ? 0.6 : 1) * fontSize,
    0,
  );
}

export function House({
  house,
  href,
  highlighted,
  mode,
  palette,
  scale = 1,
  onNavigate,
  onHover,
}: {
  house: MapHouse;
  href: string;
  /** いま開いているタグの家 */
  highlighted: boolean;
  mode: MapMode;
  /** 島の色（blue / green / pink / purple） */
  palette: string;
  /** 島ごとの家の大きさの倍率（houseScale） */
  scale?: number;
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
}) {
  const aria =
    house.kind === "member"
      ? `${house.name}（メンバー）の投稿を見る`
      : house.postCount === null
        ? `#${house.name}の投稿を見る`
        : `#${house.name}、直近7日で${house.postCount}件。投稿を見る`;
  const width = houseWidth(house, scale);
  const asset = spriteAsset(mode, palette, houseRole(house));
  const height = (width * asset.height) / asset.width;
  const { pillH, pillY } = labelLayout(house, width);
  const pad = width * 0.1;
  return (
    // 順位が変わったとき、新しい区画へ滑らかに移動する（CSSのtransition）
    // 原点 (0, 0) は家の接地点。絵はその上に、ラベルはその下に付く
    <g
      className="house-enter"
      style={{
        transform: `translate(${house.x}px, ${house.y}px)`,
        transition: "transform 700ms ease-in-out",
      }}
    >
      <a
        href={href}
        aria-label={aria}
        data-testid={`house-${house.normalizedName}`}
        className="group cursor-pointer outline-none"
        onClick={(e) => {
          // 新しいタブで開く操作などはブラウザに任せる
          if (
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.button !== 0
          ) {
            return;
          }
          e.preventDefault();
          onNavigate(href);
        }}
        onPointerEnter={() => onHover(href)}
        onFocus={() => onHover(href)}
      >
        <rect
          x={-width / 2 - pad}
          y={-height - pad}
          width={width + pad * 2}
          height={height + pillY + pillH + pad * 2}
          rx={pad * 2}
          fill="transparent"
          className={
            highlighted
              ? "stroke-sky-500"
              : "stroke-transparent group-hover:stroke-sky-300 group-focus-visible:stroke-sky-500"
          }
          strokeWidth={width * 0.04}
        />
        <g className="transition-transform duration-150 group-hover:-translate-y-0.5">
          {house.imageUrl ? (
            <image
              href={house.imageUrl}
              x={-width / 2}
              y={-width}
              width={width}
              height={width}
              preserveAspectRatio="xMidYMax meet"
            />
          ) : (
            <Sprite asset={asset} x={0} y={0} width={width} interactive />
          )}
        </g>
      </a>
    </g>
  );
}

/** 札の大きさ（家の横幅に合わせる） */
function labelLayout(house: MapHouse, width: number) {
  const label = house.kind === "member" ? house.name : `#${house.name}`;
  const fs = width * 0.17;
  const name = shortLabel(label);
  const count = house.postCount === null ? "" : String(house.postCount);
  const pillW =
    textWidth(name, fs) +
    (count ? textWidth(count, fs * 0.85) + fs * 0.6 : 0) +
    fs * 1.4;
  return { fs, name, count, pillW, pillH: fs * 1.9, pillY: fs * 0.4 };
}

/**
 * 家の名前の札（#タグ名 と件数）。家の絵より上の層にまとめて描くので、
 * 手前の家に隠れない（クリックは下の家へ通す）。
 */
export function HouseLabel({
  house,
  highlighted,
  scale = 1,
}: {
  house: MapHouse;
  highlighted: boolean;
  scale?: number;
}) {
  const width = houseWidth(house, scale);
  const { fs, name, count, pillW, pillH, pillY } = labelLayout(house, width);
  return (
    <g
      aria-hidden
      pointerEvents="none"
      style={{
        transform: `translate(${house.x}px, ${house.y}px)`,
        transition: "transform 700ms ease-in-out",
      }}
    >
      <rect
        x={-pillW / 2}
        y={pillY}
        width={pillW}
        height={pillH}
        rx={pillH / 2}
        fillOpacity={0.94}
        strokeWidth={fs * 0.1}
        // 札の色はデザイン（かわいい / かっこいい）の共通色に合わせる
        style={{
          fill: "var(--ui-card,#ffffff)",
          stroke: highlighted
            ? "var(--ui-accent,#a63868)"
            : "var(--ui-border,#efdae2)",
        }}
      />
      <text
        x={-pillW / 2 + fs * 0.7}
        y={pillY + pillH * 0.66}
        fontSize={fs}
        fontWeight={700}
        style={{ fill: "var(--ui-title,#553344)" }}
      >
        {name}
      </text>
      {count && (
        <text
          x={pillW / 2 - fs * 0.7}
          y={pillY + pillH * 0.66}
          textAnchor="end"
          fontSize={fs * 0.85}
          style={{ fill: "var(--ui-accent,#a63868)" }}
        >
          {count}
        </text>
      )}
    </g>
  );
}
