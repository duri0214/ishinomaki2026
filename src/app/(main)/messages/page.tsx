import type { Metadata } from "next";
import { connection } from "next/server";
import { MessagesLogin, MessagesView } from "@/features/messages/MessagesView";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "メッセージ",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  await connection();
  const viewer = await getViewer();
  return viewer ? <MessagesView ownerId={viewer.id} /> : <MessagesLogin />;
}
