import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import {
  displayNameFromClerk,
  FALLBACK_DISPLAY_NAME,
  findUserByClerkId,
  softDeleteUserByClerkId,
  upsertUser,
} from "@/features/users/service";
import {
  createPostInputSchema,
  postBodySchema,
  tagParamSchema,
  tagSearchQuerySchema,
  timelineQuerySchema,
} from "@/lib/validation";
import { createTestDb } from "../helpers/db";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("displayNameFromClerk", () => {
  it("ユーザー名 → 姓名 → 既定値の順に使う", () => {
    expect(displayNameFromClerk({ username: "neru", firstName: "太郎" })).toBe(
      "neru",
    );
    expect(displayNameFromClerk({ firstName: "太郎", lastName: "山田" })).toBe(
      "山田 太郎",
    );
    expect(displayNameFromClerk({ username: " ", firstName: null })).toBe(
      FALLBACK_DISPLAY_NAME,
    );
  });
  it("長すぎる名前は50文字に切る", () => {
    expect(
      Array.from(displayNameFromClerk({ username: "あ".repeat(80) })),
    ).toHaveLength(50);
  });
});

describe("upsertUser / softDeleteUserByClerkId", () => {
  it("初回は作成、2回目は同じ行を更新する", async () => {
    const a = await upsertUser(conn.db, {
      clerkUserId: "user_1",
      displayName: "Before",
      avatarUrl: null,
    });
    const b = await upsertUser(conn.db, {
      clerkUserId: "user_1",
      displayName: "After",
      avatarUrl: "https://example.com/a.png",
    });
    expect(b.id).toBe(a.id);
    const found = must(await findUserByClerkId(conn.db, "user_1"));
    expect(found.id).toBe(a.id);
    expect(found.deletedAt).toBeNull();
    expect(await findUserByClerkId(conn.db, "user_none")).toBeUndefined();
  });

  it("退会は論理削除で、行は残る", async () => {
    await upsertUser(conn.db, {
      clerkUserId: "user_2",
      displayName: "x",
      avatarUrl: "https://example.com/a.png",
    });
    await softDeleteUserByClerkId(conn.db, "user_2");
    const found = must(await findUserByClerkId(conn.db, "user_2"));
    expect(found.deletedAt).toBeInstanceOf(Date);
    // 存在しないユーザーの削除イベントは何もしない
    await expect(
      softDeleteUserByClerkId(conn.db, "user_unknown"),
    ).resolves.toBeUndefined();
  });
});

describe("入力の検証", () => {
  it("本文は前後の空白を除き、1〜280文字", () => {
    expect(postBodySchema.parse("  あ  ")).toBe("あ");
    expect(postBodySchema.safeParse("   ").success).toBe(false);
    expect(postBodySchema.safeParse("あ".repeat(280)).success).toBe(true);
    expect(postBodySchema.safeParse("あ".repeat(281)).success).toBe(false);
  });
  it("島の slug は英小文字・数字・ハイフンだけ", () => {
    const ok = (slug: string) =>
      createPostInputSchema.safeParse({ islandSlug: slug, body: "x" }).success;
    expect(ok("kita-no-shima")).toBe(true);
    expect(ok("Island")).toBe(false);
    expect(ok("a_b")).toBe(false);
    expect(ok("-a")).toBe(false);
    expect(ok("")).toBe(false);
  });
  it("タグのパラメータは正規化される", () => {
    expect(tagParamSchema.parse("ＬＩＶＥ")).toBe("live");
    expect(tagParamSchema.safeParse("あ".repeat(31)).success).toBe(false);
  });
  it("タイムラインのクエリ: tag は island とセット、limit は範囲内", () => {
    expect(timelineQuerySchema.safeParse({ tag: "a" }).success).toBe(false);
    expect(timelineQuerySchema.parse({}).limit).toBe(20);
    expect(timelineQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(timelineQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(timelineQuerySchema.parse({ island: "x", limit: "5" }).limit).toBe(
      5,
    );
    expect(timelineQuerySchema.safeParse({ cursor: "bad" }).success).toBe(
      false,
    );
  });
  it("タグ検索のクエリは先頭の # を取り除いて正規化する", () => {
    expect(tagSearchQuerySchema.parse({ island: "x", q: " ＃Live " }).q).toBe(
      "live",
    );
    expect(tagSearchQuerySchema.parse({ island: "x" }).q).toBe("");
  });
});
