"use server";

import { getDb, getTxDb } from "@/db";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import {
  markConversationRead,
  sendMessage,
  startConversation,
} from "./service";

export async function startConversationAction(recipientId: string) {
  return runAction(async () => {
    const user = await requireUser();
    return startConversation(await getDb(), user.id, recipientId);
  });
}

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
}) {
  return runAction(async () => {
    const user = await requireUser();
    return sendMessage(
      await getTxDb(),
      user.id,
      input?.conversationId,
      input?.body,
    );
  });
}

export async function markConversationReadAction(input: {
  conversationId: string;
  lastMessageId: string;
}) {
  return runAction(async () => {
    const user = await requireUser();
    await markConversationRead(
      await getDb(),
      user.id,
      input?.conversationId,
      input?.lastMessageId,
    );
    return null;
  });
}
