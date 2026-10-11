"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useDesign } from "@/features/design/useDesign";
import { decodeRouteParam } from "@/lib/route-params";

export type PhotoIsland = {
  slug: string;
  name: string;
  /** 島のメンバータグと話題タグの上位20件。ルートの tag がどの種類かを判定するのに使う */
  tags: { normalizedName: string; name: string; kind: "member" | "topic" }[];
};

/**
 * 集合写真の表示幅。`(main)/layout.tsx` のグリッドに合わせる。
 * 550px以下は全幅、551〜767pxは2列の右半分、768〜1023pxは右30%、
 * 1024px以上は左のツールバー（4.5rem）を除いた領域の30%。
 */
const PHOTO_SIZES =
  "(max-width: 550px) 100vw, (max-width: 767px) 50vw, (max-width: 1023px) 30vw, calc((100vw - 4.5rem) * 0.3)";

/**
 * タイムライン上部の集合写真。島ごとに `public/photos/<島のslug>.jpg`、
 * 世界地図では `public/photos/world.jpg` を表示する。ファイルがなければ仮の絵に切り替える。
 * タグで絞っているときは、サブタイトルに島名、タイトルにタグ（人なら人名）を出す。
 */
export function GroupPhoto({ islands }: { islands: PhotoIsland[] }) {
  const { design } = useDesign();
  const { island: slug, tag: rawTag } = useParams<{
    island?: string;
    tag?: string;
  }>();
  const island = islands.find((i) => i.slug === slug);
  const tagName = rawTag ? decodeRouteParam(rawTag) : undefined;

  let title = island?.name ?? "島マップ";
  let subtitle: string | undefined;
  if (island && tagName) {
    const tag = island.tags.find((t) => t.normalizedName === tagName);
    title = tag?.kind === "member" ? tag.name : `#${tag?.name ?? tagName}`;
    subtitle = island.name;
  }

  const src = `/photos/${slug ?? "world"}.jpg`;
  return (
    <figure className="design-hero relative h-28 w-full shrink-0 min-[551px]:aspect-[2/1] min-[551px]:h-auto min-[551px]:max-h-[27dvh] overflow-hidden bg-[#efe6f4]">
      <Photo key={src} src={src} alt={`${title}の集合写真`} />
      <span className="design-eyebrow absolute left-4 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.18em]">
        {design === "cool" ? "IDOL KINGDOM / COOL" : "IDOL KINGDOM / KAWAII"}
      </span>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-white md:px-4 md:pb-2.5 md:pt-8">
        {subtitle && (
          <p className="text-xs font-medium opacity-90">{subtitle}</p>
        )}
        <p className="truncate font-serif text-sm font-bold md:text-lg">
          {title}
        </p>
      </figcaption>
    </figure>
  );
}

function Photo({ src, alt }: { src: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <Placeholder />;
  // ハイドレーションより先に読み込みが失敗しても、next/image が onError を再通知する
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={PHOTO_SIZES}
      loading="eager"
      className="object-cover"
      onError={() => setMissing(true)}
    />
  );
}

/** 写真がまだないときの、横一列に並んだ5人のシルエット */
function Placeholder() {
  const figures = [
    { x: 52, h: 78, fill: "#d9c6ea" },
    { x: 106, h: 92, fill: "#e6b9c9" },
    { x: 160, h: 104, fill: "#b99ad6" },
    { x: 214, h: 90, fill: "#f0c9b4" },
    { x: 268, h: 76, fill: "#cdb6e3" },
  ];
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMax slice"
      className="size-full"
    >
      <defs>
        <linearGradient id="photo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e3ec" />
          <stop offset="1" stopColor="#e4dcf3" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#photo-sky)" />
      {figures.map(({ x, h, fill }) => (
        <g key={x} fill={fill}>
          <circle cx={x} cy={180 - h - 14} r="13" />
          <rect x={x - 21} y={180 - h} width="42" height={h + 4} rx="21" />
        </g>
      ))}
    </svg>
  );
}
