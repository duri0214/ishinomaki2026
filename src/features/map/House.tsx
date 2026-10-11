import { HOUSE_SIZE } from "./layout";
import { houseStyle } from "./shapes";
import type { MapHouse } from "./types";

const MAX_LABEL_CHARS = 9;

function shortLabel(name: string): string {
  const chars = Array.from(name);
  return chars.length > MAX_LABEL_CHARS
    ? `${chars.slice(0, MAX_LABEL_CHARS - 1).join("")}…`
    : name;
}

/** 家の絵。`image_url` があればその画像を優先し、なければSVGで描く */
function HouseArt({ house }: { house: MapHouse }) {
  if (house.imageUrl) {
    return (
      <image
        href={house.imageUrl}
        x={-HOUSE_SIZE / 2}
        y={-HOUSE_SIZE / 2 - 4}
        width={HOUSE_SIZE}
        height={HOUSE_SIZE}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  const s = houseStyle(house.tagId);
  const roof =
    s.roofShape === "gable" ? (
      <polygon points="-27,-6 0,-30 27,-6" fill={s.roof} />
    ) : s.roofShape === "hip" ? (
      <polygon points="-27,-6 -14,-26 14,-26 27,-6" fill={s.roof} />
    ) : (
      <path d="M-26 -6 A26 26 0 0 1 26 -6 Z" fill={s.roof} />
    );
  return (
    <g>
      <ellipse cx={0} cy={22} rx={28} ry={5} fill="rgba(0,0,0,0.14)" />
      {s.hasChimney && (
        <rect x={11} y={-30} width={6} height={12} fill={s.door} />
      )}
      <rect x={-22} y={-6} width={44} height={28} rx={2} fill={s.wall} />
      <rect x={-22} y={14} width={44} height={8} rx={2} fill={s.wallShade} />
      {roof}
      <rect x={-5} y={5} width={10} height={17} rx={1.5} fill={s.door} />
      <rect x={-17} y={2} width={8} height={8} rx={1} fill="#fff7c9" />
      <rect x={9} y={2} width={8} height={8} rx={1} fill="#fff7c9" />
    </g>
  );
}

export function House({
  house,
  href,
  highlighted,
  onNavigate,
  onHover,
}: {
  house: MapHouse;
  href: string;
  /** いま開いているタグの家 */
  highlighted: boolean;
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
}) {
  const label = house.kind === "member" ? house.name : `#${house.name}`;
  const aria =
    house.postCount === null
      ? `${house.name}（メンバー）の投稿を見る`
      : `#${house.name}、直近7日で${house.postCount}件。投稿を見る`;
  return (
    // 順位が変わったとき、スロットへ滑らかに移動する（CSSのtransition）
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
          x={-HOUSE_SIZE / 2 - 4}
          y={-HOUSE_SIZE / 2 - 8}
          width={HOUSE_SIZE + 8}
          height={HOUSE_SIZE + 44}
          rx={10}
          fill="transparent"
          className={
            highlighted
              ? "stroke-sky-500"
              : "stroke-transparent group-hover:stroke-sky-300 group-focus-visible:stroke-sky-500"
          }
          strokeWidth={2.5}
        />
        <g className="transition-transform duration-150 group-hover:-translate-y-0.5">
          <HouseArt house={house} />
        </g>
        <text
          y={HOUSE_SIZE / 2 + 12}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="#12222e"
          stroke="#ffffff"
          strokeWidth={3}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {shortLabel(label)}
        </text>
        {house.postCount !== null && (
          <text
            y={HOUSE_SIZE / 2 + 24}
            textAnchor="middle"
            fontSize={9}
            fill="#3d5566"
            stroke="#ffffff"
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {house.postCount}件
          </text>
        )}
      </a>
    </g>
  );
}
