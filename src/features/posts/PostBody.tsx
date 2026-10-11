import Link from "next/link";
import { segmentBody } from "@/features/tags/parse";

/** 本文を表示する。登録されたタグだけをリンクにする（解析は投稿時と同じ関数） */
export function PostBody({
  body,
  islandSlug,
}: {
  body: string;
  islandSlug: string;
}) {
  const segments = segmentBody(body);
  let offset = 0;
  return (
    <p className="whitespace-pre-wrap break-words text-base leading-7 text-[#6a5c7d]">
      {segments.map((seg) => {
        const key = `${offset}`;
        offset += seg.text.length;
        if (seg.type === "text") return <span key={key}>{seg.text}</span>;
        return (
          <Link
            key={key}
            href={`/i/${islandSlug}/t/${encodeURIComponent(seg.normalizedName)}`}
            className="font-bold text-[#8e6bb0] hover:underline"
          >
            {seg.text}
          </Link>
        );
      })}
    </p>
  );
}
