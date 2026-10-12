import { inArray } from "drizzle-orm";
import type { Db } from "../src/db/connect";
import { islands, tags } from "../src/db/schema";
import { normalizeTagName } from "../src/features/tags/normalize";

export type TopicTagResult = {
  slug: string;
  name: string;
  added: string[];
}[];

/**
 * 既存の島に話題タグだけを追加する。島・メンバータグ・投稿・既存の話題タグには触れない。
 * 同じ島に同名（正規化後）のタグがあれば追加しないので、何度実行しても同じ結果になる。
 * topicsBySlug のキーは島の slug。DBに無い島は結果に含めない
 */
export async function applyTopicTags(
  db: Db,
  topicsBySlug: Record<string, readonly string[]>,
): Promise<TopicTagResult> {
  const found = await db
    .select({ id: islands.id, slug: islands.slug, name: islands.name })
    .from(islands)
    .where(inArray(islands.slug, Object.keys(topicsBySlug)));

  const result: TopicTagResult = [];
  for (const island of found) {
    const rows = (topicsBySlug[island.slug] ?? []).map((name) => ({
      islandId: island.id,
      name,
      normalizedName: normalizeTagName(name),
      kind: "topic" as const,
    }));
    const inserted =
      rows.length === 0
        ? []
        : await db
            .insert(tags)
            .values(rows)
            .onConflictDoNothing({
              target: [tags.islandId, tags.normalizedName],
            })
            .returning({ name: tags.name });
    result.push({
      slug: island.slug,
      name: island.name,
      added: inserted.map((r) => r.name),
    });
  }
  return result;
}
