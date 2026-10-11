import { codePointLength, displayTagName, normalizeTagName } from "./normalize";

/** 1つの投稿でタグとして扱う最大数（重複は1つと数える） */
export const MAX_TAGS_PER_POST = 10;
/** 正規化後のタグ名の最大文字数 */
export const MAX_TAG_LENGTH = 30;

export type HashtagOccurrence = {
  /** 元の本文でのオフセット（UTF-16）。`#` を含む区間 [start, end) */
  start: number;
  end: number;
  /** 表示名（`#` を含まない） */
  name: string;
  /** 島内で一意にするための名前。URLにも使う */
  normalizedName: string;
};

export type ParsedTag = {
  name: string;
  normalizedName: string;
};

export type ParseResult = {
  /** 本文中でリンクにする箇所（先頭から10種類のタグ。重複した箇所もすべて含む） */
  occurrences: HashtagOccurrence[];
  /** 登録するタグ（重複を除き、先頭から10種類） */
  tags: ParsedTag[];
};

const HASH = new Set(["#", "＃"]);
/** URL の中の `#` をタグにしないため、解析前に塗りつぶす */
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu;
/** タグに使える文字: 文字・結合文字・数字・`_`（長音「ー」は文字に含まれる） */
const TAG_CHAR = /^[\p{L}\p{M}\p{N}_]$/u;
/** `#` の直前に置ける文字: 空白・記号。ただしタグ文字と `#` は除く */
const BOUNDARY_CHAR = /^[\s\p{Z}\p{C}\p{P}\p{S}]$/u;

function maskUrls(text: string): string {
  return text.replace(URL_PATTERN, (m) => "\u0000".repeat(m.length));
}

function lastCodePoint(s: string, end: number): string | undefined {
  if (end <= 0) return undefined;
  const low = s.charCodeAt(end - 1);
  if (low >= 0xdc00 && low <= 0xdfff && end >= 2) {
    const high = s.charCodeAt(end - 2);
    if (high >= 0xd800 && high <= 0xdbff) return s.slice(end - 2, end);
  }
  return s.slice(end - 1, end);
}

function isBoundary(prev: string | undefined): boolean {
  if (prev === undefined) return true; // 行頭
  if (HASH.has(prev) || prev === "_") return false;
  return BOUNDARY_CHAR.test(prev);
}

/**
 * 本文からハッシュタグを取り出す。
 * 投稿時の登録(createPost)と、表示時のリンク化(PostBody)の両方でこの関数を使う。
 */
export function parseHashtags(text: string): ParseResult {
  const masked = maskUrls(text);
  const found: HashtagOccurrence[] = [];

  let i = 0;
  while (i < masked.length) {
    const ch = masked[i] as string;
    if (!HASH.has(ch)) {
      i++;
      continue;
    }
    // タグ文字が続く範囲を調べる
    let j = i + 1;
    while (j < masked.length) {
      const cp = String.fromCodePoint(masked.codePointAt(j) as number);
      if (!TAG_CHAR.test(cp)) break;
      j += cp.length;
    }
    const raw = masked.slice(i + 1, j);
    const next = Math.max(j, i + 1);

    if (raw.length > 0 && isBoundary(lastCodePoint(masked, i))) {
      const normalizedName = normalizeTagName(raw);
      const length = codePointLength(normalizedName);
      const digitsOnly = /^\p{N}+$/u.test(normalizedName);
      if (length >= 1 && length <= MAX_TAG_LENGTH && !digitsOnly) {
        found.push({
          start: i,
          end: j,
          name: displayTagName(raw),
          normalizedName,
        });
      }
    }
    i = next;
  }

  // 重複を除いて先頭から10種類までをタグにする
  const tags: ParsedTag[] = [];
  const accepted = new Set<string>();
  for (const f of found) {
    if (accepted.has(f.normalizedName)) continue;
    if (tags.length >= MAX_TAGS_PER_POST) continue;
    accepted.add(f.normalizedName);
    tags.push({ name: f.name, normalizedName: f.normalizedName });
  }
  const occurrences = found.filter((f) => accepted.has(f.normalizedName));
  return { occurrences, tags };
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "tag"; text: string; normalizedName: string };

/** 表示用に、本文をテキストとタグの並びに分ける（リンク化の対象は登録されるタグだけ） */
export function segmentBody(text: string): BodySegment[] {
  const { occurrences } = parseHashtags(text);
  const segments: BodySegment[] = [];
  let pos = 0;
  for (const o of occurrences) {
    if (o.start > pos) {
      segments.push({ type: "text", text: text.slice(pos, o.start) });
    }
    segments.push({
      type: "tag",
      text: text.slice(o.start, o.end),
      normalizedName: o.normalizedName,
    });
    pos = o.end;
  }
  if (pos < text.length) segments.push({ type: "text", text: text.slice(pos) });
  return segments;
}
