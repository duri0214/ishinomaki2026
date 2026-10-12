import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { privateResponse } from "@/features/messages/http";
import { getMessages } from "@/features/messages/service";
import { messageQuerySchema } from "@/features/messages/validation";
import { getViewer } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return privateResponse(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new AppError("unauthorized", "ログインが必要です");
    const parsed = messageQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success)
      throw new AppError(
        "validation",
        parsed.error.issues[0]?.message ?? "リクエストが不正です",
      );
    const page = await getMessages(
      await getDb(),
      viewer.id,
      (await params).conversationId,
      parsed.data,
    );
    return { viewerId: viewer.id, ...page };
  });
}
