import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/connect";
import { type Island, islands, tags, userFavoriteMembers } from "@/db/schema";
import { clampToPlaza, ISLAND_RADIUS } from "@/features/map/layout";
import { validateTagName } from "@/features/tags/parse";
import { AppError } from "@/lib/errors";
import { islandSlugSchema } from "@/lib/validation";
import { MAX_MEMBERS } from "./admin-constants";

export { MAX_MEMBERS };

/** 島エディタ用の書き込み処理。呼び出し側(Server Action)で開発環境かどうかを確認すること */

const COORD_LIMIT = 5000;

const nameSchema = z.string().trim().min(1, "名前を入力してください").max(40);
const descriptionSchema = z
  .string()
  .trim()
  .max(200)
  .transform((s) => (s === "" ? null : s));

export const createIslandInputSchema = z.object({
  slug: islandSlugSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
});

const coord = z.number().finite().min(-COORD_LIMIT).max(COORD_LIMIT);

export const saveIslandInputSchema = z.object({
  slug: islandSlugSchema,
  name: nameSchema,
  description: descriptionSchema,
  worldX: coord,
  worldY: coord,
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        x: coord,
        y: coord,
      }),
    )
    .max(MAX_MEMBERS, `メンバーは${MAX_MEMBERS}人までです`),
});
export type SaveIslandInput = z.input<typeof saveIslandInputSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力が不正です";
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** 新しい島を作る。世界地図では、今ある島の右隣に重ならないように置く */
export async function createIsland(
  db: Db,
  input: z.input<typeof createIslandInputSchema>,
): Promise<Island> {
  const parsed = createIslandInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("validation", firstIssue(parsed.error));
  }
  const [edge] = await db.select({ maxX: max(islands.worldX) }).from(islands);
  const worldX =
    edge?.maxX === null || edge?.maxX === undefined
      ? 0
      : Math.round(edge.maxX + ISLAND_RADIUS * 2 + 120);
  try {
    const [row] = await db
      .insert(islands)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        worldX,
        worldY: 0,
      })
      .returning();
    if (!row) throw new Error("島を作成できませんでした");
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("validation", "その slug は既に使われています");
    }
    throw err;
  }
}

/**
 * 島の名前・説明・世界地図上の座標と、メンバータグ（名前と島内の位置）を保存する。
 * メンバーは「保存した一覧」がそのまま正になる:
 * - 一覧にあるタグは、既存の話題タグでもメンバー(kind=member)にして位置を保存する
 * - 一覧から外したメンバーは話題タグへ戻す（投稿とのひも付けは残る）
 * `txDb` は transaction() が使える接続。
 */
export async function saveIsland(
  txDb: Db,
  input: SaveIslandInput,
): Promise<Island> {
  const parsed = saveIslandInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("validation", firstIssue(parsed.error));
  }
  const data = parsed.data;

  // メンバー名は、タグとして有効な名前だけ（#は付けない）。同じ名前の重複は不可
  const members = data.members.map((m) => {
    const tag = validateTagName(m.name);
    if (!tag) {
      throw new AppError(
        "validation",
        `「${m.name}」はタグ名として使えません（空白・記号を含まない30文字以内の名前にしてください）`,
      );
    }
    return { ...tag, position: clampToPlaza({ x: m.x, y: m.y }) };
  });
  if (new Set(members.map((m) => m.normalizedName)).size !== members.length) {
    throw new AppError("validation", "同じ名前のメンバーが重複しています");
  }

  return txDb.transaction(async (tx) => {
    const [island] = await tx
      .update(islands)
      .set({
        name: data.name,
        description: data.description,
        worldX: data.worldX,
        worldY: data.worldY,
      })
      .where(eq(islands.slug, data.slug))
      .returning();
    if (!island) throw new AppError("island_not_found", "島が見つかりません");

    // 一覧から外れたメンバーは話題タグへ戻す
    const keep = members.map((m) => m.normalizedName);
    const current = await tx
      .select({ id: tags.id, normalizedName: tags.normalizedName })
      .from(tags)
      .where(and(eq(tags.islandId, island.id), eq(tags.kind, "member")));
    const removed = current
      .filter((t) => !keep.includes(t.normalizedName))
      .map((t) => t.id);
    if (removed.length > 0) {
      await tx
        .update(tags)
        .set({ kind: "topic", position: null })
        .where(inArray(tags.id, removed));
      // 話題タグに戻すと外部キーは働かないので、推しメンバーからも外す
      await tx
        .delete(userFavoriteMembers)
        .where(inArray(userFavoriteMembers.tagId, removed));
    }

    // 一覧のメンバーを作成または更新する
    for (const m of members) {
      await tx
        .insert(tags)
        .values({
          islandId: island.id,
          name: m.name,
          normalizedName: m.normalizedName,
          kind: "member",
          position: m.position,
        })
        .onConflictDoUpdate({
          target: [tags.islandId, tags.normalizedName],
          set: { name: m.name, kind: "member", position: m.position },
        });
    }
    return island;
  });
}
