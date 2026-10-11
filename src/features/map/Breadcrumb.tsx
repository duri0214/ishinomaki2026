"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { decodeRouteParam } from "@/lib/route-params";

/** 世界 > 島 > タグ のパンくず */
export function Breadcrumb({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  const params = useParams<{ island?: string; tag?: string }>();
  const island = islands.find((i) => i.slug === params.island);
  const tag = params.tag ? decodeRouteParam(params.tag) : undefined;

  return (
    <nav aria-label="現在地" className="min-w-0 text-sm">
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap">
        <li>
          <Link
            href="/"
            className="rounded px-1 font-semibold text-[var(--ui-title)] hover:bg-[var(--ui-hover)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-accent)]"
          >
            🌊 世界
          </Link>
        </li>
        {island && (
          <>
            <li aria-hidden className="text-[var(--ui-muted)]">
              ›
            </li>
            <li className="min-w-0 truncate">
              <Link
                href={`/i/${island.slug}`}
                className="rounded px-1 font-semibold text-[var(--ui-title)] hover:bg-[var(--ui-hover)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-accent)]"
              >
                {island.name}
              </Link>
            </li>
          </>
        )}
        {island && tag && (
          <>
            <li aria-hidden className="text-[var(--ui-muted)]">
              ›
            </li>
            <li
              className="min-w-0 truncate font-bold text-[var(--ui-accent)]"
              aria-current="page"
            >
              #{tag}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
