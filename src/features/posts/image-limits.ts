export const MAX_IMAGES = 4;
// Vercel Functions のリクエスト上限(4.5MB)に multipart の余裕を残す。
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export type PostImage = { url: string; width: number; height: number };
