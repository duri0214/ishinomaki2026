import { describe, expect, it } from "vitest";
import {
  createPostInputSchema,
  postBodySchema,
  tagParamSchema,
  tagSearchQuerySchema,
  timelineQuerySchema,
} from "@/lib/validation";

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
