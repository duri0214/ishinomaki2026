import { ISLAND_RADIUS } from "./layout";

/**
 * 島と家の見た目を、IDから手続き的に作る。
 * 乱数は使わず、IDのハッシュを種にした擬似乱数だけを使う（サーバーとクライアントで同じ結果になる）。
 * 座標は小数1桁に丸め、文字列として安定させる。
 */

/** 文字列の32bitハッシュ (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 種から次々と [0,1) の値を出す擬似乱数 (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * 島の輪郭。円に低い周波数のゆらぎを足し、なめらかな曲線(Catmull-Rom → Bézier)でつなぐ。
 * 半径は radius の 86%〜100% の範囲に収まる。
 */
export function islandPath(
  seed: string,
  radius: number = ISLAND_RADIUS,
): string {
  const rnd = seededRandom(hashString(`island:${seed}`));
  const harmonics = [2, 3, 5].map((n) => ({
    n,
    amp: (0.05 + rnd() * 0.05) / (n / 2),
    phase: rnd() * Math.PI * 2,
  }));
  const POINTS = 40;
  const pts = Array.from({ length: POINTS }, (_, i) => {
    const theta = (i / POINTS) * Math.PI * 2;
    const noise = harmonics.reduce(
      (sum, h) => sum + h.amp * Math.sin(h.n * theta + h.phase),
      0,
    );
    // ゆらぎ(-0.14〜+0.14程度)を 0.86〜1.0 に収める
    const r = radius * Math.min(1, Math.max(0.86, 0.93 + noise * 0.5));
    return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
  });

  const at = (i: number) =>
    pts[(i + POINTS) % POINTS] as { x: number; y: number };
  let d = `M${fmt(at(0).x)} ${fmt(at(0).y)}`;
  for (let i = 0; i < POINTS; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return `${d}Z`;
}

export type HouseStyle = {
  wall: string;
  wallShade: string;
  roof: string;
  door: string;
  roofShape: "gable" | "hip" | "dome";
  hasChimney: boolean;
};

/** タグIDから家の色と屋根の形を決める */
export function houseStyle(tagId: string): HouseStyle {
  const rnd = seededRandom(hashString(`house:${tagId}`));
  const roofHue = Math.floor(rnd() * 360);
  const wallHue = (roofHue + 150 + Math.floor(rnd() * 60)) % 360;
  const shapes = ["gable", "hip", "dome"] as const;
  return {
    wall: `hsl(${wallHue} 55% 88%)`,
    wallShade: `hsl(${wallHue} 45% 78%)`,
    roof: `hsl(${roofHue} 62% 56%)`,
    door: `hsl(${(roofHue + 20) % 360} 40% 32%)`,
    roofShape: shapes[
      Math.floor(rnd() * shapes.length)
    ] as (typeof shapes)[number],
    hasChimney: rnd() < 0.4,
  };
}
