import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import type { PostImage } from "./image-limits";
import { processImages } from "./image-processing";

export async function storeImages(files: File[]): Promise<PostImage[]> {
  const processed = await processImages(files);
  const saved: PostImage[] = [];
  try {
    for (const image of processed) {
      const filename = `${randomUUID()}.webp`;
      let url: string;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`post-images/${filename}`, image.data, {
          access: "public",
          contentType: "image/webp",
        });
        url = blob.url;
      } else {
        if (process.env.VERCEL)
          throw new Error("BLOB_READ_WRITE_TOKEN が未設定です");
        const dir = path.join(process.cwd(), "public/uploads");
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), image.data);
        url = `/uploads/${filename}`;
      }
      saved.push({ url, width: image.width, height: image.height });
    }
    return saved;
  } catch (error) {
    await removeImages(saved);
    throw error;
  }
}

export async function removeImages(images: PostImage[]) {
  const results = await Promise.allSettled(
    images.map((image) =>
      image.url.startsWith("/uploads/")
        ? unlink(
            path.join(
              process.cwd(),
              "public/uploads",
              path.basename(image.url),
            ),
          )
        : del(image.url),
    ),
  );
  for (const result of results)
    if (result.status === "rejected")
      console.error("画像の後片付けに失敗しました", result.reason);
}
