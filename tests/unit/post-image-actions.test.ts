import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  store: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db", () => ({ getDb: vi.fn(), getTxDb: vi.fn() }));
vi.mock("@/features/posts/image-storage", () => ({
  storeImages: mocks.store,
  removeImages: mocks.remove,
}));
vi.mock("@/features/posts/service", () => ({
  createPost: mocks.create,
  createReply: mocks.create,
  deletePost: vi.fn(),
}));

import { createPostAction, createReplyAction } from "@/features/posts/actions";

const images = [{ url: "/uploads/test.webp", width: 20, height: 10 }];
beforeEach(() => {
  vi.resetAllMocks();
});
it("未ログインの投稿・返信ではアップロード処理を呼ばない", async () => {
  mocks.requireUser.mockRejectedValue(
    new AppError("unauthorized", "ログインしてください"),
  );
  const attachments = new FormData();
  attachments.append(
    "images",
    new File(["test"], "photo.png", { type: "image/png" }),
  );
  expect(
    await createPostAction({ islandSlug: "test", body: "", attachments }),
  ).toMatchObject({ ok: false, code: "unauthorized" });
  expect(
    await createReplyAction({ parentPostId: "test", body: "", attachments }),
  ).toMatchObject({ ok: false, code: "unauthorized" });
  expect(mocks.store).not.toHaveBeenCalled();
});
it("投稿・返信の作成に失敗したら保存した画像を削除する", async () => {
  mocks.requireUser.mockResolvedValue({ id: "user" });
  mocks.store.mockResolvedValue(images);
  mocks.create.mockRejectedValue(
    new AppError("post_not_found", "投稿が見つかりません"),
  );
  await createPostAction({ islandSlug: "test", body: "" });
  await createReplyAction({ parentPostId: "test", body: "" });
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(mocks.remove).toHaveBeenCalledWith(images);
});
