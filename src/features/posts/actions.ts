"use server";

import { z } from "zod";
import { getDb, getTxDb } from "@/db";
import {
  getTimelinePost,
  type TimelinePost,
} from "@/features/timeline/queries";
import { type ActionResult, runAction } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { removeImages, storeImages } from "./image-storage";
import { createPost, createReply, deletePost } from "./service";

/** 投稿する。認証はここで確認する（Server Action は誰でも直接呼べる公開エンドポイント） */
export async function createPostAction(input: {
  islandSlug: string;
  body: string;
  attachments?: FormData;
}): Promise<ActionResult<TimelinePost>> {
  return runAction(async () => {
    const user = await requireUser();
    const images = await storeImages(
      (input.attachments?.getAll("images") ?? []).filter(
        (file): file is File => file instanceof File,
      ),
    );
    let postId: string;
    try {
      ({ postId } = await createPost(await getTxDb(), {
        userId: user.id,
        islandSlug: String(input?.islandSlug ?? ""),
        body: String(input?.body ?? ""),
        images,
      }));
    } catch (error) {
      await removeImages(images);
      throw error;
    }
    const post = await getTimelinePost(await getDb(), postId, user.id);
    if (!post) throw new Error("作成した投稿を読み込めませんでした");
    return post;
  });
}

/** 投稿に返信する。島は返信先と同じになる */
export async function createReplyAction(input: {
  parentPostId: string;
  body: string;
  attachments?: FormData;
}): Promise<ActionResult<TimelinePost>> {
  return runAction(async () => {
    const user = await requireUser();
    const images = await storeImages(
      (input.attachments?.getAll("images") ?? []).filter(
        (file): file is File => file instanceof File,
      ),
    );
    let postId: string;
    try {
      ({ postId } = await createReply(await getTxDb(), {
        userId: user.id,
        parentPostId: String(input?.parentPostId ?? ""),
        body: String(input?.body ?? ""),
        images,
      }));
    } catch (error) {
      await removeImages(images);
      throw error;
    }
    const post = await getTimelinePost(await getDb(), postId, user.id);
    if (!post) throw new Error("作成した返信を読み込めませんでした");
    return post;
  });
}

const postIdSchema = z.uuid();

/** 自分の投稿を削除する（論理削除） */
export async function deletePostAction(
  postId: string,
): Promise<ActionResult<{ postId: string }>> {
  return runAction(async () => {
    const parsed = postIdSchema.safeParse(postId);
    if (!parsed.success) {
      throw new AppError("post_not_found", "投稿が見つかりません");
    }
    const user = await requireUser();
    await deletePost(await getDb(), { userId: user.id, postId: parsed.data });
    return { postId: parsed.data };
  });
}
