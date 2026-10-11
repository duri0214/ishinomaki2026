import { describe, expect, it } from "vitest";
import { normalizeTagName } from "@/features/tags/normalize";
import {
  activeHashtagAt,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_POST,
  parseHashtags,
  segmentBody,
} from "@/features/tags/parse";

const names = (text: string) =>
  parseHashtags(text).tags.map((t) => t.normalizedName);

describe("normalizeTagName", () => {
  it("全角英数をNFKCで半角にし、ラテン文字を小文字にする", () => {
    expect(normalizeTagName("ＡＢＣ１２３")).toBe("abc123");
    expect(normalizeTagName("Hello")).toBe("hello");
  });
  it("半角カタカナは全角カタカナに揃う", () => {
    expect(normalizeTagName("ﾗｲﾌﾞ")).toBe("ライブ");
  });
  it("ラテン文字以外は小文字にしない（ギリシャ文字・キリル文字）", () => {
    expect(normalizeTagName("ΑΒΓ")).toBe("ΑΒΓ");
    expect(normalizeTagName("ПРИВЕТ")).toBe("ПРИВЕТ");
  });
  it("日本語はそのまま", () => {
    expect(normalizeTagName("自己紹介")).toBe("自己紹介");
  });
});

describe("parseHashtags: 基本", () => {
  it("半角 # のタグを取り出す", () => {
    expect(names("今日は #ライブ だった")).toEqual(["ライブ"]);
  });
  it("全角 ＃ も同じようにタグになる", () => {
    expect(names("今日は ＃ライブ だった")).toEqual(["ライブ"]);
  });
  it("表示名は元の大文字・小文字を保つが、正規化名は小文字になる", () => {
    const [tag] = parseHashtags("#LiveTour").tags;
    expect(tag).toEqual({ name: "LiveTour", normalizedName: "livetour" });
  });
  it("大文字・小文字違いは同じタグ", () => {
    expect(names("#Live #LIVE #live")).toEqual(["live"]);
  });
  it("アンダースコアと長音を含められる", () => {
    expect(names("#my_tag #ライブー")).toEqual(["my_tag", "ライブー"]);
  });
  it("空白・句読点・# でタグが終わる", () => {
    expect(names("#あ、#い。#う #え")).toEqual(["あ", "い", "う", "え"]);
    expect(names("(#あ)")).toEqual(["あ"]);
    expect(names("「#あ」")).toEqual(["あ"]);
  });
  it("# だけ、# の連続はタグにしない", () => {
    expect(names("# ")).toEqual([]);
    expect(names("##")).toEqual([]);
    expect(names("#")).toEqual([]);
  });
  it("改行の直後もタグになる", () => {
    expect(names("a\n#b")).toEqual(["b"]);
  });
  it("絵文字はタグ文字ではないのでそこで終わる", () => {
    expect(names("#あ😀")).toEqual(["あ"]);
  });
});

describe("parseHashtags: 直前の文字", () => {
  it("行頭・空白・記号の直後だけがタグになる", () => {
    expect(names("#a")).toEqual(["a"]);
    expect(names("x #a")).toEqual(["a"]);
    expect(names("x　#a")).toEqual(["a"]); // 全角スペース
    expect(names("x,#a")).toEqual(["a"]);
  });
  it("文字や数字の直後はタグにしない", () => {
    expect(names("abc#tag")).toEqual([]);
    expect(names("日本#語")).toEqual([]);
    expect(names("a1#b")).toEqual([]);
    expect(names("my_#tag")).toEqual([]);
  });
  it("タグの直後の # は別のタグにならない", () => {
    expect(names("#a#b")).toEqual(["a"]);
  });
});

describe("parseHashtags: URL", () => {
  it("URLの中の # はタグにしない", () => {
    expect(names("見て https://example.com/path/#anchor")).toEqual([]);
    expect(names("http://example.com/#a?x=1#b")).toEqual([]);
    expect(names("www.example.com/#frag")).toEqual([]);
  });
  it("URLの後ろのタグは取り出せる", () => {
    expect(names("https://example.com/#a #real")).toEqual(["real"]);
  });
  it("URLの手前に空白がなくてもURLは破壊されない", () => {
    const text = "https://example.com/#a";
    expect(segmentBody(text)).toEqual([{ type: "text", text }]);
  });
});

describe("parseHashtags: 数字・長さ", () => {
  it("数字だけのタグにはしない", () => {
    expect(names("#123")).toEqual([]);
    expect(names("#０１２")).toEqual([]);
    expect(names("＃１２３")).toEqual([]);
  });
  it("数字を含んでいても文字があればタグになる", () => {
    expect(names("#2026ライブ #3rd")).toEqual(["2026ライブ", "3rd"]);
    expect(names("#12_3")).toEqual(["12_3"]);
  });
  it("30文字ちょうどはタグ、31文字以上はタグにしない（切り詰めない）", () => {
    const ok = "あ".repeat(MAX_TAG_LENGTH);
    const ng = "あ".repeat(MAX_TAG_LENGTH + 1);
    expect(names(`#${ok}`)).toEqual([ok]);
    expect(names(`#${ng}`)).toEqual([]);
  });
  it("長さはコードポイントで数える（𠮷は1文字）", () => {
    const ok = "𠮷".repeat(MAX_TAG_LENGTH);
    expect(ok.length).toBe(MAX_TAG_LENGTH * 2);
    expect(names(`#${ok}`)).toEqual([ok]);
    expect(names(`#${ok}𠮷`)).toEqual([]);
  });
  it("長さの判定はNFKC正規化の後で行う", () => {
    // 「ﬃ」(合字)は正規化で「ffi」(3文字)になる
    expect(names(`#${"ﬃ".repeat(11)}`)).toEqual([]); // 正規化後33文字
    expect(names(`#${"ﬃ".repeat(10)}`)).toEqual(["ffi".repeat(10)]); // 30文字
  });
  it("長すぎる語の中に別のタグがあっても拾わない", () => {
    expect(names(`#${"a".repeat(31)}#b`)).toEqual([]);
  });
});

describe("parseHashtags: 重複と個数", () => {
  it("正規化後に同じ名前は1つにまとめる", () => {
    expect(names("#あ #あ #Ａ #a #ａ")).toEqual(["あ", "a"]);
  });
  it("先頭から10種類までをタグにし、11種類目以降はタグにしない", () => {
    const text = Array.from({ length: 12 }, (_, i) => `#t${i}`).join(" ");
    const result = parseHashtags(text);
    expect(result.tags).toHaveLength(MAX_TAGS_PER_POST);
    expect(result.tags.map((t) => t.normalizedName)).toEqual(
      Array.from({ length: 10 }, (_, i) => `t${i}`),
    );
    expect(result.occurrences).toHaveLength(10);
  });
  it("重複は10種類の数に含めない（同じタグを繰り返しても枠を消費しない）", () => {
    const text = `${"#a ".repeat(20)}#b #c #d #e #f #g #h #i #j #k`;
    expect(names(text)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
  });
  it("登録されたタグが繰り返し出てきたら、その箇所もすべてリンク対象になる", () => {
    const { occurrences } = parseHashtags("#a x #a");
    expect(occurrences.map((o) => o.start)).toEqual([0, 5]);
  });
});

describe("segmentBody", () => {
  it("本文をテキストとタグに分け、連結すると元の本文に戻る", () => {
    const text = "今日は #ライブ 最高😀 ＃Ｌｉｖｅ！ http://a.com/#x end";
    const segs = segmentBody(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.type === "tag")).toEqual([
      { type: "tag", text: "#ライブ", normalizedName: "ライブ" },
      { type: "tag", text: "＃Ｌｉｖｅ", normalizedName: "live" },
    ]);
  });
  it("11種類目以降のタグはリンクにせず、本文に残る", () => {
    const text = Array.from({ length: 11 }, (_, i) => `#t${i}`).join(" ");
    const segs = segmentBody(text);
    expect(segs.filter((s) => s.type === "tag")).toHaveLength(10);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });
  it("タグがなければ本文全体が1つのテキスト", () => {
    expect(segmentBody("こんにちは")).toEqual([
      { type: "text", text: "こんにちは" },
    ]);
    expect(segmentBody("")).toEqual([]);
  });
});

describe("activeHashtagAt", () => {
  const at = (text: string, caret = text.length) =>
    activeHashtagAt(text, caret);
  it("入力中のタグの開始位置と、ここまでに入力した文字を返す", () => {
    expect(at("こんにちは #ラ")).toEqual({ start: 6, query: "ラ" });
    expect(at("#")).toEqual({ start: 0, query: "" });
    expect(at("a ＃Li")).toEqual({ start: 2, query: "Li" });
  });
  it("キャレットがタグの途中にあれば、そこまでを返す", () => {
    expect(at("#ライブ好き", 3)).toEqual({ start: 0, query: "ライ" });
  });
  it("空白などでタグが終わった後や、直前が文字の # は対象外", () => {
    expect(at("#ライブ ")).toBeNull();
    expect(at("abc#tag")).toBeNull();
    expect(at("普通の文")).toBeNull();
    expect(at("")).toBeNull();
  });
});
