export const DESIGNS = ["cool", "kawaii"] as const;
export type Design = (typeof DESIGNS)[number];

export const DEFAULT_DESIGN: Design = "kawaii";
export const DESIGN_STORAGE_KEY = "ishinomaki-design";

export function isDesign(value: unknown): value is Design {
  return DESIGNS.some((design) => design === value);
}

/** 保存済みの選択を初回描画より前に適用する。外部の値をコードへ埋め込まない。 */
export const DESIGN_INIT_SCRIPT = `(() => {
  let design = ${JSON.stringify(DEFAULT_DESIGN)};
  try {
    const saved = localStorage.getItem(${JSON.stringify(DESIGN_STORAGE_KEY)});
    if (${JSON.stringify(DESIGNS)}.includes(saved)) design = saved;
  } catch {}
  document.documentElement.dataset.design = design;
})();`;
