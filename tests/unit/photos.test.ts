import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupPhoto } from "@/features/layout/photos";

describe("集合写真", () => {
  it("島の名前（グループ名）で写真を探す。記号や拡張子の違いを吸収する", () => {
    expect(groupPhoto({ name: "ARASHI", slug: "hoshizora" })).toBe(
      "/photos/arashi.jpg",
    );
    expect(groupPhoto({ name: "M!LK", slug: "tsukiakari" })).toBe(
      "/photos/mlk.webp",
    );
    expect(groupPhoto({ name: "TWICE", slug: "shiokaze" })).toBe(
      "/photos/twice.jpg",
    );
  });

  it("名前で見つからなければ slug で探し、なければ <slug>.jpg、世界地図は world.jpg", () => {
    expect(groupPhoto({ name: "トゥワイス", slug: "twice" })).toBe(
      "/photos/twice.jpg",
    );
    expect(groupPhoto({ name: "まだない島", slug: "nijiiro" })).toBe(
      "/photos/nijiiro.jpg",
    );
    expect(groupPhoto()).toBe("/photos/world.jpg");
  });

  it("登録した写真のファイルが public/photos/ にある", () => {
    for (const name of ["ARASHI", "M!LK", "TWICE"]) {
      const src = groupPhoto({ name, slug: "x" });
      expect(existsSync(`public${src}`), src).toBe(true);
    }
  });
});
