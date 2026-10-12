import { memo, type ReactNode, useState } from "react";
import {
  baseAsset,
  depthScale,
  hasLevelImages,
  LEVEL_FRAME,
  levelImage,
  type MapMode,
  SPRITE_SIZES,
  spriteAsset,
} from "./assets";
import { House, HouseLabel, houseWidth } from "./House";
import {
  buildGrowth,
  buildHouses,
  buildMembers,
  houseScale,
  hubOf,
  ISLAND_RADIUS,
  islandLevel,
  type SearchedTag,
} from "./layout";
import { MemberIcon, MemberLabel } from "./MemberIcon";
import { Sprite } from "./Sprite";
import type { MapFocus, MapIslandData } from "./types";

function IslandBody({
  island,
  focus,
  mode,
  searchResults,
  onNavigate,
  onHover,
}: {
  island: MapIslandData;
  focus: MapFocus;
  mode: MapMode;
  searchResults?: readonly SearchedTag[];
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
}) {
  const href = `/i/${island.slug}`;
  // 土台の絵と家の位置は、モード専用の土台があればそちら（かわいい / かっこいい で島の絵が変わる）
  const base = baseAsset(island.base, mode);
  const focused = focus.kind !== "world" && focus.slug === island.slug;
  const dimmed = focus.kind !== "world" && !focused;
  // 家はフォーカス中の島だけ。タグを検索中は、10軒が検索結果に入れ替わる
  const houses = focused
    ? buildHouses(
        island,
        focus.kind === "house" ? focus.normalizedName : undefined,
        searchResults,
        mode,
      )
    : [];
  const scale = houseScale(island, mode);
  // メンバーは、街の中心の広場に丸いアイコン（ハッシュタグ）で並べる。家はそのまわりを囲む
  const members = focused ? buildMembers(island, mode) : [];
  const hub = hubOf(island, mode);
  // ホバー・フォーカス中のメンバー（名前の札を出す）
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const searchedMembers = new Set(
    (searchResults ?? []).map((t) => t.normalizedName),
  );
  const memberHighlighted = (normalizedName: string) =>
    (focus.kind === "house" && focus.normalizedName === normalizedName) ||
    searchedMembers.has(normalizedName);
  // 札の文字は、家の札（家の幅 × 0.17）より少し大きく
  const labelMin =
    houseWidth(
      {
        tagId: "",
        name: "",
        normalizedName: "",
        imageUrl: null,
        kind: "topic",
        postCount: null,
        rank: null,
        x: 0,
        y: hub.y,
      },
      scale,
    ) * 0.2;
  // 島民数 ＝ この島をフォローしている人の数（DB の user_favorite_islands）
  const population = island.population ?? 0;
  const level = islandLevel(population);
  // 世界地図では、レベルの絵があればそれを見せる。島を開くと絵は消えて、土台（lv1）＋家10軒になる
  const levelSrc = levelImage(island.base, mode, level);
  // レベルの絵がまだない島は、代わりにペンライト・桜・ステージ・城を置いて成長を見せる
  const growth = hasLevelImages(island.base, mode)
    ? []
    : buildGrowth(island, population, mode);

  // 地面の y が大きい（手前の）ものほど後に描いて、上に重ねる
  const items: { y: number; node: ReactNode }[] = [
    ...growth.map((g) => ({
      y: g.y,
      node: (
        <Sprite
          key={`growth-${g.key}`}
          asset={spriteAsset(mode, base.palette, g.role)}
          x={g.x}
          y={g.y}
          width={SPRITE_SIZES[g.role] * g.scale * depthScale(g.y)}
          shadow={g.role !== "penlight"}
        />
      ),
    })),
    ...houses.map((house) => ({
      y: house.y,
      node: (
        <House
          key={`house-${house.tagId}`}
          house={house}
          href={`${href}/t/${encodeURIComponent(house.normalizedName)}`}
          highlighted={
            focus.kind === "house" &&
            focus.normalizedName === house.normalizedName
          }
          mode={mode}
          palette={base.palette}
          scale={scale}
          onNavigate={onNavigate}
          onHover={onHover}
        />
      ),
    })),
    // メンバーの広場は、広場の手前の端の高さで重ねる（広場より手前の家は、広場の上に描く）
    ...(members.length > 0
      ? [
          {
            y: hub.y + hub.ry,
            node: (
              <g key="members" data-testid={`members-${island.slug}`}>
                {members.map((member) => (
                  <MemberIcon
                    key={`member-${member.tagId}`}
                    member={member}
                    href={`${href}/t/${encodeURIComponent(member.normalizedName)}`}
                    highlighted={memberHighlighted(member.normalizedName)}
                    mode={mode}
                    onNavigate={onNavigate}
                    onHover={onHover}
                    onActive={setActiveMember}
                  />
                ))}
              </g>
            ),
          },
        ]
      : []),
  ].sort((a, b) => a.y - b.y);

  return (
    <g
      transform={`translate(${island.worldX} ${island.worldY})`}
      style={{ opacity: dimmed ? 0.55 : 1, transition: "opacity 400ms" }}
      data-island={island.slug}
    >
      {/* 島そのもの。世界地図ではこれをクリックして島へ入る */}
      <a
        href={href}
        aria-label={`${island.name}を開く`}
        data-testid={`island-${island.slug}`}
        className="cursor-pointer outline-none"
        onClick={(e) => {
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
        {/* 島の土台（モード共通）。家や木の位置は、この画像に合わせて slots.json で決めてある */}
        <image
          href={base.src}
          x={-ISLAND_RADIUS}
          y={-ISLAND_RADIUS}
          width={ISLAND_RADIUS * 2}
          height={ISLAND_RADIUS * 2}
        />
        {levelSrc && (
          <image
            href={levelSrc}
            x={-ISLAND_RADIUS}
            y={-ISLAND_RADIUS * (1 + 2 * LEVEL_FRAME.top)}
            width={ISLAND_RADIUS * 2}
            height={
              ISLAND_RADIUS * 2 * (1 + LEVEL_FRAME.top + LEVEL_FRAME.bottom)
            }
            data-testid={`island-level-${island.slug}`}
            style={{
              opacity: focused ? 0 : 1,
              transition: "opacity 650ms ease-in-out",
            }}
          />
        )}
      </a>
      {items.map((item) => item.node)}
      {/* 家の名前の札は、家や木より上の層に描く（手前の家に隠れないように） */}
      {houses.map((house) => (
        <HouseLabel
          key={`label-${house.tagId}`}
          house={house}
          highlighted={
            focus.kind === "house" &&
            focus.normalizedName === house.normalizedName
          }
          scale={scale}
        />
      ))}
      {/* メンバーの名前の札（#名前）。ホバー中・開いている・検索に当たったメンバーだけ。ホバー中のものをいちばん上に */}
      {members
        .filter(
          (m) =>
            m.normalizedName === activeMember ||
            memberHighlighted(m.normalizedName),
        )
        .sort(
          (a, b) =>
            Number(a.normalizedName === activeMember) -
            Number(b.normalizedName === activeMember),
        )
        .map((member) => (
          <MemberLabel
            key={`member-label-${member.tagId}`}
            member={member}
            mode={mode}
            minFontSize={labelMin}
          />
        ))}
      {/* 島の名前と島民数。家や木より上に重ねる（クリックは下の島へ通す） */}
      <text
        y={focused ? -ISLAND_RADIUS - 16 : ISLAND_RADIUS * 0.62}
        textAnchor="middle"
        fontSize={focused ? 30 : 46}
        fontWeight={800}
        fill="#12222e"
        stroke="#ffffff"
        strokeWidth={6}
        paintOrder="stroke"
        strokeLinejoin="round"
        pointerEvents="none"
        aria-hidden
        style={{ transition: "opacity 300ms" }}
        opacity={focused ? 0.9 : 1}
      >
        {island.name}
      </text>
      <text
        y={focused ? -ISLAND_RADIUS + 12 : ISLAND_RADIUS * 0.62 + 40}
        textAnchor="middle"
        fontSize={focused ? 18 : 28}
        fontWeight={700}
        fill="#5b4a78"
        stroke="#ffffff"
        strokeWidth={5}
        paintOrder="stroke"
        strokeLinejoin="round"
        pointerEvents="none"
        aria-hidden
      >
        {`Lv.${level} ・ 島民 ${population.toLocaleString("ja-JP")}人`}
      </text>
    </g>
  );
}

/**
 * マップの中身（世界の島々と、フォーカス中の島の家）。
 * カメラが動いても props が変わらないので、memo で再描画を避ける。
 */
export const MapScene = memo(function MapScene({
  islands,
  focus,
  mode,
  searchResults,
  onNavigate,
  onHover,
}: {
  islands: MapIslandData[];
  focus: MapFocus;
  mode: MapMode;
  /** タグ検索の結果（フォーカス中の島の家が、これに入れ替わる） */
  searchResults?: readonly SearchedTag[];
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
}) {
  return (
    <>
      {islands.map((island) => (
        <IslandBody
          key={island.id}
          island={island}
          focus={focus}
          mode={mode}
          searchResults={
            focus.kind !== "world" && focus.slug === island.slug
              ? searchResults
              : undefined
          }
          onNavigate={onNavigate}
          onHover={onHover}
        />
      ))}
    </>
  );
});
