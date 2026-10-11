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
          <Link href="/" className="rounded px-1 hover:bg-slate-100">
            🌊 世界
          </Link>
        </li>
        {island && (
          <>
            <li aria-hidden className="text-slate-400">
              ›
            </li>
            <li className="min-w-0 truncate">
              <Link
                href={`/i/${island.slug}`}
                className="rounded px-1 hover:bg-slate-100"
              >
                {island.name}
              </Link>
            </li>
          </>
        )}
        {island && tag && (
          <>
            <li aria-hidden className="text-slate-400">
              ›
            </li>
            <li className="min-w-0 truncate font-bold" aria-current="page">
              #{tag}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
