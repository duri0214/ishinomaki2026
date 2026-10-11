"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/** ツールバーの島ボタン。いまいる島を強調する */
export function ToolbarIslands({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  const { island: current } = useParams<{ island?: string }>();
  return (
    <nav
      aria-label="島"
      className="flex min-w-0 items-center gap-2 overflow-x-auto lg:flex-col lg:overflow-visible"
    >
      {islands.map(({ slug, name }) => {
        const active = slug === current;
        return (
          <Link
            key={slug}
            href={`/i/${slug}`}
            aria-label={name}
            aria-current={active ? "page" : undefined}
            title={name}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-serif text-lg font-bold transition-colors ${
              active
                ? "bg-[#fffcf8] text-[#2b2140]"
                : "bg-[#3d3157] text-[#e7def5] hover:bg-[#4a3d68]"
            }`}
          >
            {Array.from(name)[0]}
          </Link>
        );
      })}
    </nav>
  );
}
