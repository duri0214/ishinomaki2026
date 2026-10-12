"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { setFollow } from "./service";

const setFollowInputSchema = z.object({
  userId: z.uuid(),
  following: z.boolean(),
});

/** フォローを望む状態(following)にそろえる。トグルではないので、連打・再送しても結果が変わらない */
export async function setFollowAction(input: {
  userId: string;
  following: boolean;
}): Promise<ActionResult<{ following: boolean; followerCount: number }>> {
  return runAction(async () => {
    const parsed = setFollowInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation", "入力が不正です");
    }
    const user = await requireUser();
    return setFollow(await getDb(), {
      followerId: user.id,
      followeeId: parsed.data.userId,
      following: parsed.data.following,
    });
  });
}
