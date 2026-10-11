import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { applyClerkWebhookEvent } from "@/features/users/sync";
import { getEnv } from "@/lib/env";

/** Clerk の Webhook を受けて users テーブルへ反映する（署名は svix で検証される） */
export async function POST(req: NextRequest) {
  const secret = getEnv().CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return new Response("Webhook is not configured", { status: 503 });
  }
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(req, { signingSecret: secret });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const result = await applyClerkWebhookEvent(await getDb(), {
    type: event.type,
    data: event.data as Parameters<typeof applyClerkWebhookEvent>[1]["data"],
  });
  return Response.json({ result });
}
