import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Connection } from "@/db/connect";
import { ensureUserFor, findUserByClerkId } from "@/features/users/service";
import { applyClerkWebhookEvent } from "@/features/users/sync";
import { createTestDb } from "../helpers/db";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

describe("ensureUserFor", () => {
  it("初回は Clerk のプロフィールから users の行を作り、2回目は Clerk に問い合わせない", async () => {
    const fetchProfile = vi.fn(async () => ({
      displayName: "ねる",
      avatarUrl: "https://example.com/a.png",
    }));
    const first = must(await ensureUserFor(conn.db, "user_a", fetchProfile));
    const second = must(await ensureUserFor(conn.db, "user_a", fetchProfile));
    expect(second.id).toBe(first.id);
    expect(fetchProfile).toHaveBeenCalledTimes(1);
  });

  it("退会済みのユーザーは null", async () => {
    await applyClerkWebhookEvent(conn.db, {
      type: "user.created",
      data: { id: "user_b", username: "b" },
    });
    await applyClerkWebhookEvent(conn.db, {
      type: "user.deleted",
      data: { id: "user_b" },
    });
    const fetchProfile = vi.fn();
    expect(await ensureUserFor(conn.db, "user_b", fetchProfile)).toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});

describe("applyClerkWebhookEvent", () => {
  it("user.created で作成し、user.updated で表示名とアバターを更新する", async () => {
    expect(
      await applyClerkWebhookEvent(conn.db, {
        type: "user.created",
        data: {
          id: "user_c",
          username: null,
          first_name: "太郎",
          last_name: "山田",
        },
      }),
    ).toBe("upserted");
    const created = must(await findUserByClerkId(conn.db, "user_c"));

    await applyClerkWebhookEvent(conn.db, {
      type: "user.updated",
      data: {
        id: "user_c",
        username: "taro",
        image_url: "https://example.com/t.png",
      },
    });
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await conn.db
      .select()
      .from(users)
      .where(eq(users.id, created.id));
    expect(must(row)).toMatchObject({
      displayName: "taro",
      avatarUrl: "https://example.com/t.png",
    });
  });

  it("user.deleted は論理削除", async () => {
    await applyClerkWebhookEvent(conn.db, {
      type: "user.created",
      data: { id: "user_d" },
    });
    expect(
      await applyClerkWebhookEvent(conn.db, {
        type: "user.deleted",
        data: { id: "user_d" },
      }),
    ).toBe("deleted");
    expect(
      must(await findUserByClerkId(conn.db, "user_d")).deletedAt,
    ).toBeInstanceOf(Date);
  });

  it("id がない・知らない種類のイベントは何もしない", async () => {
    expect(
      await applyClerkWebhookEvent(conn.db, { type: "user.created", data: {} }),
    ).toBe("ignored");
    expect(
      await applyClerkWebhookEvent(conn.db, {
        type: "session.created",
        data: { id: "sess_1" },
      }),
    ).toBe("ignored");
    expect(await findUserByClerkId(conn.db, "sess_1")).toBeUndefined();
  });
});
