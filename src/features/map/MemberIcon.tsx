import { useId } from "react";
import type { MapMode } from "./assets";
import { textWidth } from "./House";
import { hashString } from "./shapes";
import type { MapMember } from "./types";

/** 絵がまだないメンバーの、頭文字アイコンの色（タグIDから決めるので、同じメンバーはいつも同じ色） */
const PLACEHOLDER_COLORS = [
  "#f08bb4",
  "#9d8cf0",
  "#5fbfe3",
  "#6cc99b",
  "#f2a85c",
  "#ee7f7f",
  "#7f9ff0",
  "#c286e8",
] as const;

/** モードごとのアイコンの色（縁・強調・ハッシュタグの印） */
const THEME: Record<
  MapMode,
  { fill: string; stroke: string; accent: string; label: string }
> = {
  kawaii: {
    fill: "#fffaf6",
    stroke: "#f6c1d8",
    accent: "#e8679e",
    label: "#7a3a5c",
  },
  cool: {
    fill: "#1b2140",
    stroke: "#5cc8e4",
    accent: "#3a8fe0",
    label: "#16324f",
  },
};

const themeOf = (mode: MapMode) => THEME[mode] ?? THEME.kawaii;

/**
 * メンバーのアイコン（島の中央の広場に並べる、丸いハッシュタグ）。
 * 絵（imageUrl）があれば丸く切り抜いて見せ、なければ頭文字の丸にする。
 * クリックでそのメンバーのタグのページへ。ホバー・フォーカス中は onActive で名前の札を出してもらう
 */
export function MemberIcon({
  member,
  href,
  highlighted,
  mode,
  onNavigate,
  onHover,
  onActive,
}: {
  member: MapMember;
  href: string;
  /** いま開いているメンバー、または検索に当たったメンバー */
  highlighted: boolean;
  mode: MapMode;
  onNavigate: (href: string) => void;
  onHover: (href: string) => void;
  /** ホバー・フォーカスしたメンバー（離れたら null） */
  onActive: (normalizedName: string | null) => void;
}) {
  const clipId = useId();
  const theme = themeOf(mode);
  const r = member.size / 2;
  const ring = member.size * 0.07;
  const inner = r - ring;
  const color =
    PLACEHOLDER_COLORS[hashString(member.tagId) % PLACEHOLDER_COLORS.length];
  const initial = Array.from(member.name)[0] ?? "?";
  return (
    <g transform={`translate(${member.x} ${member.y})`}>
      <a
        href={href}
        aria-label={`#${member.name}（メンバー）の投稿を見る`}
        data-testid={`house-${member.normalizedName}`}
        data-member
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
        onPointerEnter={() => {
          onHover(href);
          onActive(member.normalizedName);
        }}
        onPointerLeave={() => onActive(null)}
        onFocus={() => {
          onHover(href);
          onActive(member.normalizedName);
        }}
        onBlur={() => onActive(null)}
      >
        {/* 地面の影 */}
        <ellipse
          cx={0}
          cy={r * 0.95}
          rx={r * 0.78}
          ry={r * 0.2}
          fill="rgba(40, 28, 60, 0.22)"
        />
        <g
          className="transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {highlighted && (
            <circle
              r={r + ring * 1.6}
              fill="none"
              stroke={theme.accent}
              strokeOpacity={0.45}
              strokeWidth={ring * 1.6}
            />
          )}
          <circle
            r={r}
            fill={theme.fill}
            stroke={highlighted ? theme.accent : theme.stroke}
            strokeWidth={ring * (highlighted ? 0.9 : 0.6)}
            className="group-hover:stroke-sky-400 group-focus-visible:stroke-sky-500"
          />
          {member.imageUrl ? (
            <>
              <clipPath id={clipId}>
                <circle r={inner} />
              </clipPath>
              <image
                href={member.imageUrl}
                x={-inner}
                y={-inner}
                width={inner * 2}
                height={inner * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />
            </>
          ) : (
            <>
              <circle r={inner} fill={color} />
              <text
                y={inner * 0.36}
                textAnchor="middle"
                fontSize={inner * 1.02}
                fontWeight={800}
                fill="#ffffff"
              >
                {initial}
              </text>
            </>
          )}
          {/* ハッシュタグの印 */}
          <g transform={`translate(${r * 0.72} ${r * 0.68})`}>
            <circle
              r={r * 0.3}
              fill={theme.accent}
              stroke="#ffffff"
              strokeWidth={r * 0.06}
            />
            <text
              y={r * 0.12}
              textAnchor="middle"
              fontSize={r * 0.36}
              fontWeight={800}
              fill="#ffffff"
            >
              #
            </text>
          </g>
        </g>
      </a>
    </g>
  );
}

/**
 * メンバーの名前の札（#名前）。アイコンの上に出す。
 * 家やほかのアイコンより上の層にまとめて描くので隠れない（クリックは下のアイコンへ通す）
 */
export function MemberLabel({
  member,
  mode,
  minFontSize = 0,
}: {
  member: MapMember;
  mode: MapMode;
  /** 家の札より小さくならないように */
  minFontSize?: number;
}) {
  const theme = themeOf(mode);
  const text = `#${member.name}`;
  const fs = Math.max(member.size * 0.27, minFontSize);
  const w = textWidth(text, fs) + fs * 1.4;
  const h = fs * 1.9;
  const bottom = member.y - member.size / 2 - fs * 0.55;
  const tip = fs * 0.45;
  return (
    <g
      aria-hidden
      pointerEvents="none"
      data-testid={`member-label-${member.normalizedName}`}
    >
      <path
        d={`M ${member.x - tip} ${bottom - 0.5} L ${member.x} ${bottom + tip} L ${member.x + tip} ${bottom - 0.5} Z`}
        fill="rgba(255, 252, 248, 0.97)"
        stroke={theme.accent}
        strokeWidth={fs * 0.1}
        strokeLinejoin="round"
      />
      <rect
        x={member.x - w / 2}
        y={bottom - h}
        width={w}
        height={h}
        rx={h / 2}
        fill="rgba(255, 252, 248, 0.97)"
        stroke={theme.accent}
        strokeWidth={fs * 0.1}
      />
      <text
        x={member.x}
        y={bottom - h * 0.34}
        textAnchor="middle"
        fontSize={fs}
        fontWeight={800}
        fill={theme.label}
      >
        {text}
      </text>
    </g>
  );
}
