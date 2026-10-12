import { z } from "zod";
import { codePointLength, normalizeTagName } from "@/features/tags/normalize";
import { MAX_TAG_LENGTH } from "@/features/tags/parse";
import { decodeCursor } from "./cursor";

export const MAX_POST_LENGTH = 280;
export const TIMELINE_PAGE_SIZE = 20;
export const TIMELINE_MAX_PAGE_SIZE = 50;

/** 島の slug: 英小文字・数字・ハイフン */
export const islandSlugSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug は英小文字・数字・ハイフンで指定してください",
  );

/** 本文: ハッシュタグを含めて1〜280文字（コードポイント単位）。改行は \n にそろえる */
const optionalPostBodySchema = z
  .string()
  .transform((s) => s.replace(/\r\n?/g, "\n").trim())
  .refine(
    (s) => codePointLength(s) <= MAX_POST_LENGTH,
    `本文は${MAX_POST_LENGTH}文字以内で入力してください`,
  );

export const postBodySchema = optionalPostBodySchema.refine(
  (s) => s.length > 0,
  "本文を入力してください",
);
const attachmentFields = {
  body: optionalPostBodySchema,
  images: z
    .array(
      z.object({
        url: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .max(4)
    .default([]),
};
const hasContent = (input: { body: string; images: unknown[] }) =>
  input.body.length > 0 || input.images.length > 0;

/** URL などで受け取ったタグ名。島内で一意にする正規化名にそろえる */
export const tagParamSchema = z
  .string()
  .min(1)
  .max(MAX_TAG_LENGTH * 4)
  .transform(normalizeTagName)
  .refine(
    (s) => s.length > 0 && codePointLength(s) <= MAX_TAG_LENGTH,
    "タグ名が不正です",
  );

const cursorSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => decodeCursor(s) !== null, "カーソルが不正です");

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(TIMELINE_MAX_PAGE_SIZE)
  .default(TIMELINE_PAGE_SIZE);

/** GET /api/timeline のクエリ。`tag` は `island` とセットで指定する */
export const timelineQuerySchema = z
  .object({
    island: islandSlugSchema.optional(),
    tag: tagParamSchema.optional(),
    cursor: cursorSchema.optional(),
    limit: limitSchema,
  })
  .refine((q) => !q.tag || q.island, {
    message: "tag を指定するときは island も指定してください",
    path: ["island"],
  });
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

/** GET /api/tags/search のクエリ */
export const tagSearchQuerySchema = z.object({
  island: islandSlugSchema,
  q: z
    .string()
    .max(MAX_TAG_LENGTH * 4)
    .default("")
    .transform((s) => normalizeTagName(s.trim().replace(/^[#＃]/, ""))),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type TagSearchQuery = z.infer<typeof tagSearchQuerySchema>;

export const createPostInputSchema = z
  .object({
    islandSlug: islandSlugSchema,
    ...attachmentFields,
  })
  .refine(hasContent, "本文または画像を入力してください");

export const createReplyInputSchema = z
  .object({
    parentPostId: z.uuid(),
    ...attachmentFields,
  })
  .refine(hasContent, "本文または画像を入力してください");

export const setLikeInputSchema = z.object({
  postId: z.uuid(),
  liked: z.boolean(),
});
