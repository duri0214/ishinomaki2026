"use server";

import { getDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { setLikeInputSchema } from "@/lib/validation";
import { type LikeState, setLike } from "./service";

/** いいねを望む状態(liked)にそろえる。トグルではないので、連打・再送しても結果が変わらない */
export async function setLikeAction(input: {
  postId: string;
  liked: boolean;
}): Promise<ActionResult<LikeState>> {
  return runAction(async () => {
    const parsed = setLikeInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation", "入力が不正です");
    }
    const user = await requireUser();
    return setLike(await getDb(), { userId: user.id, ...parsed.data });
  });
}
