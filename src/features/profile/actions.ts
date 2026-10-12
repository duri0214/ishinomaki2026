"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getTxDb } from "@/db";
import { ISLAND_FOLLOWERS_CACHE_TAG } from "@/features/map/data";
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
    // 推しグループが変わると、マップの島民数（レベル）も変わる
    updateTag(ISLAND_FOLLOWERS_CACHE_TAG);
    return null;
  });
}
