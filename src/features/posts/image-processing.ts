import sharp from "sharp";
import { AppError } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
} from "./image-limits";

export async function processImages(files: File[]) {
  if (files.length > MAX_IMAGES)
    throw new AppError("validation", "画像は4枚まで添付できます");
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
    throw new AppError("validation", "画像の合計サイズは4MB以内にしてください");
  }
  const result: { data: Buffer; width: number; height: number }[] = [];
  for (const file of files) {
    if (!file.size || file.size > MAX_IMAGE_BYTES)
      throw new AppError("validation", "画像は1枚4MB以内にしてください");
    const formats: Record<string, string> = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (!formats[file.type])
      throw new AppError("validation", "JPEG・PNG・WebPの画像を選んでください");
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const image = sharp(bytes, {
        limitInputPixels: 40_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (metadata.format !== formats[file.type] || (metadata.pages ?? 1) > 1)
        throw new Error("format");
      // デコードして再エンコード。メタデータは引き継がず、EXIFの向きだけを反映する。
      const { data, info } = await image
        .autoOrient()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      result.push({ data, width: info.width, height: info.height });
    } catch {
      throw new AppError(
        "validation",
        "画像を読み込めません。形式とファイルの内容を確認してください",
      );
    }
  }
  return result;
}
