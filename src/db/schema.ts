import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * 時刻は全て ミリ秒精度(precision 3) で保存する。
 * JS の Date もミリ秒精度なので、カーソル(created_at, id)を往復しても行が欠けない。
 */
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date", precision: 3 });

export const tagKind = pgEnum("tag_kind", ["member", "topic"]);

export const islands = pgTable("islands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  worldX: real("world_x").notNull(),
  worldY: real("world_y").notNull(),
  theme: jsonb("theme").$type<Record<string, unknown>>(),
  imageUrl: text("image_url"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  deletedAt: timestamptz("deleted_at"),
});

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    islandId: uuid("island_id")
      .notNull()
      .references(() => islands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    kind: tagKind("kind").notNull().default("topic"),
    /** メンバータグの島内座標 */
    position: jsonb("position").$type<{ x: number; y: number }>(),
    imageUrl: text("image_url"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("tags_island_normalized_name_uq").on(t.islandId, t.normalizedName),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    islandId: uuid("island_id")
      .notNull()
      .references(() => islands.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    index("posts_island_created_idx").on(
      t.islandId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("posts_created_idx").on(
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
);

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tags_tag_post_idx").on(t.tagId, t.postId),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("likes_post_idx").on(t.postId),
  ],
);

export type Island = typeof islands.$inferSelect;
export type User = typeof users.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Post = typeof posts.$inferSelect;
