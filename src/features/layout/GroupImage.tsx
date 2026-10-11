"use client";

import Image from "next/image";
import { useId, useState } from "react";

export function GroupImage({
  src,
  alt,
  sizes,
}: {
  src: string;
  alt: string;
  sizes: string;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return <Placeholder />;
  // ハイドレーションより先に読み込みが失敗しても、next/image が onError を再通知する
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loading="eager"
      className="object-cover"
      onError={() => setMissing(true)}
    />
  );
}

/** 写真がまだないときの、横一列に並んだ5人のシルエット */
function Placeholder() {
  const gradientId = useId();
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
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e3ec" />
          <stop offset="1" stopColor="#e4dcf3" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${gradientId})`} />
      {figures.map(({ x, h, fill }) => (
        <g key={x} fill={fill}>
          <circle cx={x} cy={180 - h - 14} r="13" />
          <rect x={x - 21} y={180 - h} width="42" height={h + 4} rx="21" />
        </g>
      ))}
    </svg>
  );
}
