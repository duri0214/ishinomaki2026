import { getDb } from "@/db";
import { privateResponse } from "@/features/messages/http";
import { listConversations } from "@/features/messages/service";
import { getViewer } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return privateResponse(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new AppError("unauthorized", "ログインが必要です");
    return {
      viewerId: viewer.id,
      conversations: await listConversations(await getDb(), viewer.id),
    };
  });
}
