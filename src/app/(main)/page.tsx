import { connection } from "next/server";
import { getDb } from "@/db";
import { getTimeline } from "@/features/timeline/queries";
import { Timeline } from "@/features/timeline/Timeline";
import { getViewerId } from "@/lib/auth";
import { TIMELINE_PAGE_SIZE } from "@/lib/validation";

/** 世界地図 ＋ 全島のタイムライン（各投稿に島名のバッジが付く） */
export default async function WorldPage() {
  await connection();
  const initialPage = await getTimeline(await getDb(), {
    scope: { kind: "all" },
    limit: TIMELINE_PAGE_SIZE,
    viewerId: await getViewerId(),
  });
  return (
    <Timeline
      scope={{}}
      initialPage={initialPage}
      emptyMessage="まだ投稿がありません。島に入って最初の投稿をしてみよう"
    />
  );
}
