import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { MessagesLogin, MessagesView } from "@/features/messages/MessagesView";
import { getConversation } from "@/features/messages/service";
import { getViewer } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "メッセージ",
  robots: { index: false, follow: false },
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return <MessagesLogin />;
  try {
    const conversation = await getConversation(
      await getDb(),
      viewer.id,
      (await params).conversationId,
    );
    return (
      <MessagesView ownerId={viewer.id} conversationId={conversation.id} />
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "conversation_not_found")
      notFound();
    throw error;
  }
}
