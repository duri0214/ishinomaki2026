"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { deleteLiveRecord, saveLiveRecord } from "./service";

export async function saveLiveRecordAction(input: {
  eventId: string;
  note: string;
}) {
  return runAction(async () => {
    const user = await requireUser();
    await saveLiveRecord(await getDb(), user.id, input);
    revalidatePath("/", "layout");
    return null;
  });
}
export async function deleteLiveRecordAction(eventId: string) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteLiveRecord(await getDb(), user.id, eventId);
    revalidatePath("/", "layout");
    return null;
  });
}
