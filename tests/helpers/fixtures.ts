import type { Db } from "@/db/connect";
import { islands, posts, tags, users } from "@/db/schema";
import { must } from "./must";

let seq = 0;

export async function insertIsland(db: Db, slug = `island-${++seq}`) {
  const [row] = await db
    .insert(islands)
    .values({ slug, name: slug, worldX: 0, worldY: 0 })
    .returning();
  return must(row);
}

export async function insertUser(db: Db, name = `user-${++seq}`) {
  const [row] = await db
    .insert(users)
    .values({
      username: `u${++seq}_${name}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 20),
      passwordHash: "!",
      displayName: name,
    })
    .returning();
  return must(row);
}

export async function insertTag(
  db: Db,
  islandId: string,
  name: string,
  kind: "member" | "topic" = "topic",
) {
  const [row] = await db
    .insert(tags)
    .values({ islandId, name, normalizedName: name.toLowerCase(), kind })
    .returning();
  return must(row);
}

export async function insertPost(
  db: Db,
  values: {
    islandId: string;
    authorId: string;
    body?: string;
    createdAt?: Date;
    id?: string;
    deletedAt?: Date | null;
    parentPostId?: string | null;
  },
) {
  const [row] = await db
    .insert(posts)
    .values({ body: "本文", ...values })
    .returning();
  return must(row);
}
