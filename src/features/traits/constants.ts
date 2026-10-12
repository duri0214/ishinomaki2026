/** 傾向タグの段階。左のラベルが 1、右のラベルが 5 */
export const TRAIT_MIN = 1;
export const TRAIT_MAX = 5;

export const TRAIT_CATEGORIES = [
  {
    key: "overall",
    label: "全体",
    axes: [
      { key: "cute-cool", left: "かわいい", right: "かっこいい" },
      { key: "fragile-strong", left: "儚さ", right: "強さ" },
      { key: "retro-futuristic", left: "レトロ", right: "近未来" },
    ],
  },
  {
    key: "group",
    label: "グループ",
    axes: [
      { key: "fantasy-real", left: "ファンタジー", right: "リアル" },
      { key: "pure-luxury", left: "ピュア", right: "ラグジュアリー" },
      { key: "fresh-sexy", left: "フレッシュ", right: "セクシー" },
    ],
  },
  {
    key: "music",
    label: "曲調",
    axes: [
      { key: "elegant-dynamic", left: "エレガント", right: "ダイナミック" },
      { key: "happy-emotional", left: "ハッピー", right: "エモーショナル" },
      { key: "chill-explosive", left: "チル", right: "爆発" },
      { key: "japanese-western", left: "和", right: "洋" },
    ],
  },
] as const;

export type TraitAxis = (typeof TRAIT_CATEGORIES)[number]["axes"][number];
export type TraitKey = TraitAxis["key"];

export const TRAIT_AXES: readonly TraitAxis[] = TRAIT_CATEGORIES.flatMap(
  (c): readonly TraitAxis[] => c.axes,
);
export const TRAIT_KEYS = TRAIT_AXES.map((a) => a.key) as [
  TraitKey,
  ...TraitKey[],
];
