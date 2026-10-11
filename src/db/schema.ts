import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 入力どおりの表記で保存する。一意性は大文字・小文字を区別せずに判定する */
    username: text("username").notNull(),
    /** scrypt のハッシュ（features/auth/password.ts）。'!' はどのパスワードとも一致しない */
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Cookie のトークンの SHA-256（hex）。トークンそのものは保存しない */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** 失敗したログインの記録（試行回数の制限に使う） */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usernameLower: text("username_lower").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_username_created_idx").on(
      t.usernameLower,
      t.createdAt,
    ),
  ],
);

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
    // user_favorite_members の複合外部キーの参照先
    unique("tags_id_island_uq").on(t.id, t.islandId),
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

/** 推しグループ（島） */
export const userFavoriteIslands = pgTable(
  "user_favorite_islands",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    islandId: uuid("island_id")
      .notNull()
      .references(() => islands.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.islandId] })],
);

/**
 * 推しメンバー。複合外部キーで「推しグループの島に属するタグ」であることを保証する。
 * 推しグループから外すと、その島の推しメンバーも消える。kind = 'member' かはアプリ側で確かめる。
 */
export const userFavoriteMembers = pgTable(
  "user_favorite_members",
  {
    userId: uuid("user_id").notNull(),
    islandId: uuid("island_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tagId] }),
    foreignKey({
      name: "user_favorite_members_island_fk",
      columns: [t.userId, t.islandId],
      foreignColumns: [
        userFavoriteIslands.userId,
        userFavoriteIslands.islandId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_favorite_members_tag_fk",
      columns: [t.tagId, t.islandId],
      foreignColumns: [tags.id, tags.islandId],
    }).onDelete("cascade"),
  ],
);

export type Island = typeof islands.$inferSelect;
export type User = typeof users.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Post = typeof posts.$inferSelect;

/** デモを含むライブ公演。グループごとに管理する。 */
export const liveEvents = pgTable(
  "live_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    islandId: uuid("island_id")
      .notNull()
      .references(() => islands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    venue: text("venue").notNull(),
    startsAt: timestamptz("starts_at").notNull(),
  },
  (t) => [unique("live_events_island_title_uq").on(t.islandId, t.title)],
);

/** フォロー解除後も参戦記録は残す。本人と公演の組み合わせは一意。 */
export const liveRecords = pgTable(
  "live_records",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => liveEvents.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);
