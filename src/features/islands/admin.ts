import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/connect";
import { type Island, islands, tags, userFavoriteMembers } from "@/db/schema";
import { BASE_NAMES } from "@/features/map/assets";
import { clampToPlaza } from "@/features/map/layout";
import { validateTagName } from "@/features/tags/parse";
import { AppError } from "@/lib/errors";
import { islandSlugSchema } from "@/lib/validation";
import { MAX_MEMBERS } from "./admin-constants";
import { nextIslandPosition } from "./placement";

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
  /** マップの土台（base-01 など）。省略すると作成順に割り当てる */
  base: z
    .string()
    .refine((b) => BASE_NAMES.includes(b), "その土台はありません")
    .optional(),
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

/** 新しい島を作る。世界地図では、2段の並び（placement.ts）の空いている場所に、今ある島と重ならないように置く */
export async function createIsland(
  db: Db,
  input: z.input<typeof createIslandInputSchema>,
): Promise<Island> {
  const parsed = createIslandInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("validation", firstIssue(parsed.error));
  }
  const existing = await db
    .select({ worldX: islands.worldX, worldY: islands.worldY })
    .from(islands);
  const position = nextIslandPosition(existing);
  try {
    const [row] = await db
      .insert(islands)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        worldX: position.x,
        worldY: position.y,
        theme: parsed.data.base ? { base: parsed.data.base } : null,
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

/** 島の土台（マップの絵。base-01 など）を選ぶ。islands.theme.base に保存する（DBの列は増やさない） */
export async function setIslandBase(
  db: Db,
  slug: string,
  base: string,
): Promise<Island> {
  if (!BASE_NAMES.includes(base)) {
    throw new AppError("validation", "その土台はありません");
  }
  const [current] = await db
    .select({ theme: islands.theme })
    .from(islands)
    .where(eq(islands.slug, slug))
    .limit(1);
  if (!current) throw new AppError("island_not_found", "島が見つかりません");
  const [island] = await db
    .update(islands)
    .set({ theme: { ...(current.theme ?? {}), base } })
    .where(eq(islands.slug, slug))
    .returning();
  if (!island) throw new AppError("island_not_found", "島が見つかりません");
  return island;
}

/**
 * 家（話題タグ）を新しく建てる。投稿がまだなくても、上位10件に空きがあればマップに家が出る。
 * すでに同じ名前のタグがあるときはエラー。
 */
export async function createTopicTag(
  db: Db,
  slug: string,
  name: string,
): Promise<{ normalizedName: string }> {
  const tag = validateTagName(name.trim().replace(/^[#＃]/, ""));
  if (!tag) {
    throw new AppError(
      "validation",
      `「${name}」はタグ名として使えません（空白・記号を含まない30文字以内の名前にしてください）`,
    );
  }
  const [island] = await db
    .select({ id: islands.id })
    .from(islands)
    .where(eq(islands.slug, slug))
    .limit(1);
  if (!island) throw new AppError("island_not_found", "島が見つかりません");
  const inserted = await db
    .insert(tags)
    .values({
      islandId: island.id,
      name: tag.name,
      normalizedName: tag.normalizedName,
      kind: "topic",
    })
    .onConflictDoNothing({ target: [tags.islandId, tags.normalizedName] })
    .returning({ normalizedName: tags.normalizedName });
  if (inserted.length === 0) {
    throw new AppError("validation", `#${tag.name} はこの島にすでにあります`);
  }
  return { normalizedName: tag.normalizedName };
}
