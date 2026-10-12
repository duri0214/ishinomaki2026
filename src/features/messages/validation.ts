import { z } from "zod";
import { decodeCursor } from "@/lib/cursor";
import { postBodySchema } from "@/lib/validation";

export const conversationIdSchema = z
  .uuid()
  .transform((id) => id.toLowerCase());
export const messageBodySchema = postBodySchema;
export const messageQuerySchema = z.object({
  cursor: z
    .string()
    .min(1)
    .max(200)
    .refine((s) => decodeCursor(s) !== null, "カーソルが不正です")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
