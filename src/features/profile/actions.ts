"use server";

import { revalidatePath } from "next/cache";
import { getTxDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { type UpdateProfileInput, updateProfile } from "./service";

/** 自分の表示名と推しを保存する */
export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    await updateProfile(await getTxDb(), user.id, input);
    revalidatePath(`/u/${user.username}`);
    return null;
  });
}
