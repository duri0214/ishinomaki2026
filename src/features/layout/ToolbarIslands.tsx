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
      className="flex min-w-0 items-center gap-2 overflow-x-auto wide:lg:flex-col wide:lg:overflow-visible"
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
                ? "bg-[var(--ui-selected)] text-[var(--ui-selected-text)] ring-2 ring-[var(--ui-accent)]"
                : "bg-[var(--ui-rail-button)] text-[var(--ui-rail-text)] hover:bg-[var(--ui-rail-hover)]"
            }`}
          >
            {Array.from(name)[0]}
          </Link>
        );
      })}
    </nav>
  );
}
