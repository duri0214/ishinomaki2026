import type { Db } from "@/db/connect";
import {
  displayNameFromClerk,
  softDeleteUserByClerkId,
  upsertUser,
} from "./service";

/** Clerk の Webhook イベントのうち、使う部分だけを表した型 */
export type ClerkWebhookEvent = {
  type: string;
  data: {
    id?: string | null;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

export type SyncResult = "upserted" | "deleted" | "ignored";

/** user.created / user.updated / user.deleted を users テーブルへ反映する */
export async function applyClerkWebhookEvent(
  db: Db,
  event: ClerkWebhookEvent,
): Promise<SyncResult> {
  const clerkUserId = event.data.id;
  if (!clerkUserId) return "ignored";
  switch (event.type) {
    case "user.created":
    case "user.updated":
      await upsertUser(db, {
        clerkUserId,
        displayName: displayNameFromClerk({
          username: event.data.username,
          firstName: event.data.first_name,
          lastName: event.data.last_name,
        }),
        avatarUrl: event.data.image_url ?? null,
      });
      return "upserted";
    case "user.deleted":
      await softDeleteUserByClerkId(db, clerkUserId);
      return "deleted";
    default:
      return "ignored";
  }
}
