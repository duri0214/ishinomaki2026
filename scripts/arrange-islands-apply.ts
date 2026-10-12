import { asc, eq } from "drizzle-orm";
import type { Db } from "../src/db/connect";
import { islands } from "../src/db/schema";
import { islandGridPosition } from "../src/features/islands/placement";

export type ArrangeResult = {
  slug: string;
  name: string;
  x: number;
  y: number;
}[];

/**
 * 今ある島を、世界地図の2段の並び（placement.ts）に置き直す。
 * 並び順は作った順。同時に作った島（シードなど）は、今の位置の 左→右・上→下 の順
 */
export async function arrangeIslands(txDb: Db): Promise<ArrangeResult> {
  return txDb.transaction(async (tx) => {
    const rows = await tx
      .select({ id: islands.id, slug: islands.slug, name: islands.name })
      .from(islands)
      .orderBy(
        asc(islands.createdAt),
        asc(islands.worldX),
        asc(islands.worldY),
        asc(islands.slug),
      );
    const result: ArrangeResult = [];
    for (const [index, row] of rows.entries()) {
      const p = islandGridPosition(index);
      await tx
        .update(islands)
        .set({ worldX: p.x, worldY: p.y })
        .where(eq(islands.id, row.id));
      result.push({ slug: row.slug, name: row.name, ...p });
    }
    return result;
  });
}
