/** 表示用のタグ名: NFKC正規化だけ行い、大文字・小文字は保つ */
export function displayTagName(raw: string): string {
  return raw.normalize("NFKC");
}

/**
 * 島内で一意にするための名前。
 * NFKC正規化に加えて、ラテン文字だけを小文字にする（ギリシャ文字やキリル文字は変えない）。
 */
export function normalizeTagName(raw: string): string {
  return displayTagName(raw).replace(/\p{Script=Latin}/gu, (c) =>
    c.toLowerCase(),
  );
}

/** コードポイント単位の長さ（絵文字や𠮷など、サロゲートペアを1文字と数える） */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
