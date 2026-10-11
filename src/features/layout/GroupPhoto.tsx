"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * タイムライン上部の集合写真。島ごとに `public/photos/<島のslug>.jpg`、
 * 世界地図では `public/photos/world.jpg` を表示する。ファイルがなければ仮の絵に切り替える。
 */
export function GroupPhoto({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  const { island: slug } = useParams<{ island?: string }>();
  const name = islands.find((i) => i.slug === slug)?.name ?? "島マップ";
  const src = `/photos/${slug ?? "world"}.jpg`;
  return (
    <figure className="relative h-28 shrink-0 overflow-hidden rounded-b-[28px] bg-[#efe6f4] lg:h-auto lg:max-h-[30dvh] lg:aspect-video">
      <Photo key={src} src={src} alt={`${name}の集合写真`} />
    </figure>
  );
}

function Photo({ src, alt }: { src: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // 読み込みの失敗がハイドレーションより先に起きると onError が呼ばれないので、ここでも確かめる
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    if (img.complete && img.naturalWidth === 0) {
      setMissing(true);
      return;
    }
    const onError = () => setMissing(true);
    img.addEventListener("error", onError);
    return () => img.removeEventListener("error", onError);
  }, []);

  if (missing) return <Placeholder />;
  return (
    // biome-ignore lint/performance/noImgElement: 画像がなければ onError で差し替えるため、next/image は使わない
    <img ref={ref} src={src} alt={alt} className="size-full object-cover" />
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
