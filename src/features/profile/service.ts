import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/connect";
import {
  islands,
  tags,
  userFavoriteIslands,
  userFavoriteMembers,
  users,
} from "@/db/schema";
import { displayNameSchema } from "@/features/auth/validation";
import { AppError } from "@/lib/errors";
import { islandSlugSchema } from "@/lib/validation";

export type FavoriteGroup = {
  island: { slug: string; name: string };
  members: { id: string; name: string; normalizedName: string }[];
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  favorites: FavoriteGroup[];
};

/** 推しグループと推しメンバー。島は選んだ順、メンバーは島内の名前順 */
export async function getFavorites(
  db: Db,
  userId: string,
): Promise<FavoriteGroup[]> {
  const groups = await db
    .select({ id: islands.id, slug: islands.slug, name: islands.name })
    .from(userFavoriteIslands)
    .innerJoin(islands, eq(islands.id, userFavoriteIslands.islandId))
    .where(eq(userFavoriteIslands.userId, userId))
    .orderBy(asc(userFavoriteIslands.createdAt), asc(islands.slug));
  if (groups.length === 0) return [];
  const members = await db
    .select({
      islandId: userFavoriteMembers.islandId,
      id: tags.id,
      name: tags.name,
      normalizedName: tags.normalizedName,
    })
    .from(userFavoriteMembers)
    .innerJoin(tags, eq(tags.id, userFavoriteMembers.tagId))
    // 島エディタでメンバーから外れたタグは出さない（念のため）
    .where(and(eq(userFavoriteMembers.userId, userId), eq(tags.kind, "member")))
    .orderBy(asc(tags.name));
  return groups.map((g) => ({
    island: { slug: g.slug, name: g.name },
    members: members
      .filter((m) => m.islandId === g.id)
      .map(({ id, name, normalizedName }) => ({ id, name, normalizedName })),
  }));
}

/** ユーザー名（大文字・小文字を区別しない）でプロフィールを探す。退会済みなら undefined */
export async function getProfileByUsername(
  db: Db,
  username: string,
): Promise<Profile | undefined> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      and(
        eq(sql`lower(${users.username})`, username.toLowerCase()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!user) return undefined;
  return { ...user, favorites: await getFavorites(db, user.id) };
}

export const updateProfileInputSchema = z.object({
  displayName: displayNameSchema,
  favorites: z
    .array(
      z.object({
        islandSlug: islandSlugSchema,
        memberTagIds: z.array(z.uuid()).max(100),
      }),
    )
    .max(100),
});

export type UpdateProfileInput = z.input<typeof updateProfileInputSchema>;

/** 表示名と推しを保存する。推しは送られた内容で全置き換えする。`txDb` は transaction() が使える接続 */
export async function updateProfile(
  txDb: Db,
  userId: string,
  input: UpdateProfileInput,
): Promise<void> {
  const parsed = updateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "validation",
      parsed.error.issues[0]?.message ?? "入力が不正です",
    );
  }
  const { displayName, favorites } = parsed.data;
  const slugs = [...new Set(favorites.map((f) => f.islandSlug))];
  if (slugs.length !== favorites.length) {
    throw new AppError("validation", "同じ島が重複しています");
  }

  await txDb.transaction(async (tx) => {
    const found =
      slugs.length > 0
        ? await tx
            .select({ id: islands.id, slug: islands.slug })
            .from(islands)
            .where(inArray(islands.slug, slugs))
        : [];
    const islandIdBySlug = new Map(found.map((i) => [i.slug, i.id]));

    const memberRows: { islandId: string; tagId: string }[] = [];
    for (const f of favorites) {
      const islandId = islandIdBySlug.get(f.islandSlug);
      if (!islandId)
        throw new AppError("island_not_found", "島が見つかりません");
      const ids = [...new Set(f.memberTagIds)];
      if (ids.length === 0) continue;
      const valid = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            inArray(tags.id, ids),
            eq(tags.islandId, islandId),
            eq(tags.kind, "member"),
          ),
        );
      if (valid.length !== ids.length) {
        throw new AppError(
          "validation",
          "選んだグループに所属していないメンバーが含まれています",
        );
      }
      for (const tagId of ids) memberRows.push({ islandId, tagId });
    }

    await tx
      .update(users)
      .set({ displayName, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
    // 推しグループを消すと、外部キーの CASCADE で推しメンバーも消える
    await tx
      .delete(userFavoriteIslands)
      .where(eq(userFavoriteIslands.userId, userId));
    // 選んだ順を created_at で保つ
    const base = Date.now();
    for (const [i, f] of favorites.entries()) {
      await tx.insert(userFavoriteIslands).values({
        userId,
        islandId: islandIdBySlug.get(f.islandSlug) as string,
        createdAt: new Date(base + i),
      });
    }
    if (memberRows.length > 0) {
      await tx
        .insert(userFavoriteMembers)
        .values(memberRows.map((m) => ({ userId, ...m })));
    }
  });
}
