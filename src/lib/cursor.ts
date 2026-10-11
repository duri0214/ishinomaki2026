import { z } from "zod";

/** タイムラインのページング位置。(created_at, id) の組で並べるので、同時刻の投稿も欠けない */
export type Cursor = { createdAt: Date; id: string };

const payloadSchema = z.object({
  t: z.iso.datetime({ offset: true }),
  i: z.uuid(),
});

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify({
    t: cursor.createdAt.toISOString(),
    i: cursor.id,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** 不正なカーソルは null を返す（呼び出し側で400にする） */
export function decodeCursor(value: string): Cursor | null {
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = payloadSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return { createdAt: new Date(parsed.data.t), id: parsed.data.i };
  } catch {
    return null;
  }
}
