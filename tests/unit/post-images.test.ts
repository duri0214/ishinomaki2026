import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { processImages } from "@/features/posts/image-processing";
import { createPost, createReply, deletePost } from "@/features/posts/service";
import { getReplies, getTimelinePost } from "@/features/timeline/queries";
import { createTestDb } from "../helpers/db";
import { insertIsland, insertUser } from "../helpers/fixtures";

const createImage = () =>
  sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } });
const file = (data: Buffer, type = "image/png") =>
  new File([new Uint8Array(data)], "photo.png", { type });

describe("画像の検証とEXIF除去", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "%sを読み込み、EXIFを除去する",
    async (format) => {
      const bytes = await createImage()
        .withExif({
          IFD0: { Artist: "private" },
          IFD3: { GPSLatitudeRef: "N", GPSLatitude: "35/1 0/1 0/1" },
        })
        .toFormat(format)
        .toBuffer();
      expect((await sharp(bytes).metadata()).exif).toBeDefined();
      const [result] = await processImages([file(bytes, `image/${format}`)]);
      const meta = await sharp(result?.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.format).toBe("webp");
      expect(result).toMatchObject({ width: 20, height: 10 });
    },
  );
  it("偽装・破損・未対応形式・空ファイルを拒否する", async () => {
    const png = await createImage().png().toBuffer();
    for (const invalid of [
      file(png, "image/jpeg"),
      file(Buffer.from("not an image")),
      file(png, "image/svg+xml"),
      file(Buffer.alloc(0)),
    ]) {
      await expect(processImages([invalid])).rejects.toMatchObject({
        code: "validation",
      });
    }
  });
  it("枚数と合計サイズの上限を検証する", async () => {
    const png = file(await createImage().png().toBuffer());
    await expect(processImages(Array(5).fill(png))).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      processImages([file(Buffer.alloc(4 * 1024 * 1024 + 1))]),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      processImages(Array(2).fill(file(Buffer.alloc(3 * 1024 * 1024)))),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await processImages(Array(4).fill(png))).toHaveLength(4);
  });
});

let conn: Connection;
beforeAll(async () => {
  conn = await createTestDb();
});
afterAll(async () => {
  await conn.close();
});
it("画像だけの投稿・返信が取得でき、削除後に表示されない", async () => {
  const island = await insertIsland(conn.db);
  const user = await insertUser(conn.db);
  const images = [
    { url: "/uploads/a.webp", width: 20, height: 10 },
    { url: "/uploads/b.webp", width: 10, height: 20 },
  ];
  const { postId } = await createPost(conn.db, {
    userId: user.id,
    islandSlug: island.slug,
    body: "",
    images,
  });
  expect((await getTimelinePost(conn.db, postId, user.id))?.images).toEqual(
    images,
  );
  const reply = await createReply(conn.db, {
    userId: user.id,
    parentPostId: postId,
    body: "",
    images,
  });
  expect((await getReplies(conn.db, postId, user.id))[0]?.images).toEqual(
    images,
  );
  await deletePost(conn.db, { userId: user.id, postId: reply.postId });
  expect(await getReplies(conn.db, postId, user.id)).toEqual([]);
  await deletePost(conn.db, { userId: user.id, postId });
  expect(await getTimelinePost(conn.db, postId, user.id)).toBeUndefined();
});
