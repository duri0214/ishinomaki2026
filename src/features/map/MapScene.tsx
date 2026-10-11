import { memo } from "react";
import { House } from "./House";
import { buildHouses, ISLAND_RADIUS, PLAZA_RADIUS } from "./layout";
import { islandPath } from "./shapes";
import type { MapFocus, MapIslandData } from "./types";

function IslandBody({
  island,
  focus,
  onNavigate,
  onHover,
}: {
  island: MapIslandData;
  focus: MapFocus;
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
}) {
  const href = `/i/${island.slug}`;
  const d = islandPath(island.id);
  const focused = focus.kind !== "world" && focus.slug === island.slug;
  const houses = focused ? buildHouses(island) : [];
  const dimmed = focus.kind !== "world" && !focused;

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
        {island.imageUrl ? (
          <image
            href={island.imageUrl}
            x={-ISLAND_RADIUS}
            y={-ISLAND_RADIUS}
            width={ISLAND_RADIUS * 2}
            height={ISLAND_RADIUS * 2}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <>
            {/* 浅瀬 → 砂浜 → 草地 の3層 */}
            <path d={d} transform="scale(1.1)" fill="#bfe6ee" opacity={0.75} />
            <path d={d} fill="#f2e2b0" />
            <path d={d} transform="scale(0.93)" fill="#a8d98a" />
          </>
        )}
        {focused && <circle r={PLAZA_RADIUS} fill="#ecdfb8" opacity={0.9} />}
        <text
          y={focused ? -ISLAND_RADIUS - 16 : 8}
          textAnchor="middle"
          fontSize={focused ? 30 : 46}
          fontWeight={800}
          fill="#12222e"
          stroke="#ffffff"
          strokeWidth={6}
          paintOrder="stroke"
          strokeLinejoin="round"
          style={{ transition: "opacity 300ms" }}
          opacity={focused ? 0.9 : 1}
        >
          {island.name}
        </text>
      </a>
      {houses.map((house) => (
        <House
          key={house.tagId}
          house={house}
          href={`${href}/t/${encodeURIComponent(house.normalizedName)}`}
          highlighted={
            focus.kind === "house" &&
            focus.normalizedName === house.normalizedName
          }
          onNavigate={onNavigate}
          onHover={onHover}
        />
      ))}
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
  onNavigate,
  onHover,
}: {
  islands: MapIslandData[];
  focus: MapFocus;
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
          onNavigate={onNavigate}
          onHover={onHover}
        />
      ))}
    </>
  );
});
