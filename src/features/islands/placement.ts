import { ISLAND_RADIUS } from "@/features/map/layout";

/**
 * 世界地図での島の並べ方。2段に並べ、左の列から「上→下→次の列」の順に埋めていく
 * （島が増えても横一列に伸びすぎず、上下2段のまま右へ増える）
 */
export const ISLAND_GRID_ROWS = 2;
/** 列の間隔（島の中心どうし）。島の幅（ISLAND_RADIUS の2倍）にすき間を足したもの */
export const ISLAND_GRID_STEP_X = ISLAND_RADIUS * 2 + 170;
/** 段の間隔。島の下に出る名前の札のぶん、すき間を取る */
export const ISLAND_GRID_STEP_Y = ISLAND_RADIUS * 2 + 130;
/** きっちり並びすぎないように、奇数列だけ少し下げる */
const ISLAND_GRID_STAGGER = 40;

/** index 番目（0から）の島の位置 */
export function islandGridPosition(index: number): { x: number; y: number } {
  const col = Math.floor(index / ISLAND_GRID_ROWS);
  const row = index % ISLAND_GRID_ROWS;
  return {
    x: col * ISLAND_GRID_STEP_X,
    y: row * ISLAND_GRID_STEP_Y + (col % 2) * ISLAND_GRID_STAGGER,
  };
}

/**
 * 新しい島を置く位置。並びの先頭から順に見て、今ある島のどれとも重ならない（中心が島の幅以上離れている）最初の場所
 * （島エディタで動かした島があっても重ならない）
 */
export function nextIslandPosition(
  existing: readonly { worldX: number; worldY: number }[],
): { x: number; y: number } {
  for (let i = 0; ; i++) {
    const p = islandGridPosition(i);
    const free = existing.every(
      (e) => Math.hypot(e.worldX - p.x, e.worldY - p.y) >= ISLAND_RADIUS * 2,
    );
    if (free) return p;
  }
}
