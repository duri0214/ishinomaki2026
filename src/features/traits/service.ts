import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/connect";
import { islands, islandTraits } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { islandSlugSchema } from "@/lib/validation";
import { TRAIT_KEYS, TRAIT_MAX, TRAIT_MIN, type TraitKey } from "./constants";

/** 軸ごとの段階。未評価の軸は含まない */
export type TraitScores = Partial<Record<TraitKey, number>>;

const scoreSchema = z.number().int().min(TRAIT_MIN).max(TRAIT_MAX).nullable();

/** scores の値は 1〜5。null はその軸を未評価に戻す。含めなかった軸は変更しない */
export const saveIslandTraitsInputSchema = z.object({
  slug: islandSlugSchema,
  scores: z.partialRecord(z.enum(TRAIT_KEYS), scoreSchema),
});
export type SaveIslandTraitsInput = z.input<typeof saveIslandTraitsInputSchema>;

const isTraitKey = (axis: string): axis is TraitKey =>
  (TRAIT_KEYS as readonly string[]).includes(axis);

/** 島の傾向タグを返す。定義にない軸の行は無視する */
export async function getIslandTraits(
  db: Db,
  islandId: string,
): Promise<TraitScores> {
  const rows = await db
    .select({ axis: islandTraits.axis, score: islandTraits.score })
    .from(islandTraits)
    .where(eq(islandTraits.islandId, islandId));
  const scores: TraitScores = {};
  for (const row of rows) {
    if (isTraitKey(row.axis)) scores[row.axis] = row.score;
  }
  return scores;
}

/**
 * 島の傾向タグを保存する。呼び出し側(Server Action)で開発環境かどうかを確認すること。
 * 保存後の全体を返す。`txDb` は transaction() が使える接続。
 */
export async function saveIslandTraits(
  txDb: Db,
  input: SaveIslandTraitsInput,
): Promise<TraitScores> {
  const parsed = saveIslandTraitsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "入力が不正です",
    );
  }
  const { slug, scores } = parsed.data;

  const upserts: { axis: TraitKey; score: number }[] = [];
  const clears: TraitKey[] = [];
  for (const axis of TRAIT_KEYS) {
    const score = scores[axis];
    if (score === undefined) continue;
    if (score === null) clears.push(axis);
    else upserts.push({ axis, score });
  }

  return txDb.transaction(async (tx) => {
    const [island] = await tx
      .select({ id: islands.id })
      .from(islands)
      .where(eq(islands.slug, slug));
    if (!island) throw new AppError("island_not_found", "島が見つかりません");

    if (clears.length > 0) {
      await tx
        .delete(islandTraits)
        .where(
          and(
            eq(islandTraits.islandId, island.id),
            inArray(islandTraits.axis, clears),
          ),
        );
    }
    if (upserts.length > 0) {
      await tx
        .insert(islandTraits)
        .values(upserts.map((u) => ({ islandId: island.id, ...u })))
        .onConflictDoUpdate({
          target: [islandTraits.islandId, islandTraits.axis],
          set: {
            score: sql`excluded.score`,
            updatedAt: sql`now()`,
          },
        });
    }
    return getIslandTraits(tx, island.id);
  });
}
