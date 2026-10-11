import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@/db/connect";
import { loginAttempts, sessions, users } from "@/db/schema";
import {
  createSession,
  deleteSession,
  findSession,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  renewSessionIfNeeded,
  SESSION_TTL_MS,
  sessionIdFromToken,
  signIn,
  signUp,
} from "@/features/auth/service";
import type { AppErrorCode } from "@/lib/errors";
import { createTestDb } from "../helpers/db";
import { must } from "../helpers/must";

let conn: Connection;

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

const PASSWORD = "password-123";

async function expectCode(promise: Promise<unknown>, code: AppErrorCode) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("signUp", () => {
  it("登録すると表示名はユーザー名になり、パスワードはハッシュで保存される", async () => {
    const user = await signUp(conn.db, {
      username: "Alice_01",
      password: PASSWORD,
    });
    expect(user).toMatchObject({
      username: "Alice_01",
      displayName: "Alice_01",
    });
    const row = must(
      (await conn.db.select().from(users).where(eq(users.id, user.id)))[0],
    );
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash.startsWith("scrypt$")).toBe(true);
  });

  it("大文字・小文字だけ違うユーザー名は登録できない", async () => {
    await signUp(conn.db, { username: "bob", password: PASSWORD });
    await expectCode(
      signUp(conn.db, { username: "BOB", password: PASSWORD }),
      "username_taken",
    );
  });

  it("同時の登録で一意インデックスに違反しても、ユーザー名重複のエラーになる", async () => {
    const results = await Promise.allSettled([
      signUp(conn.db, { username: "race", password: PASSWORD }),
      signUp(conn.db, { username: "RACE", password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "username_taken" });
  });

  it("ユーザー名の規則（文字種・長さ・予約した接頭辞）とパスワードの長さを検証する", async () => {
    for (const username of ["ab", "a".repeat(21), "あいう", "a-b", "a b"]) {
      await expectCode(
        signUp(conn.db, { username, password: PASSWORD }),
        "validation",
      );
    }
    for (const username of ["seed_x", "SEED_x", "Seed_user_1"]) {
      await expectCode(
        signUp(conn.db, { username, password: PASSWORD }),
        "validation",
      );
    }
    await expectCode(
      signUp(conn.db, { username: "shortpw", password: "1234567" }),
      "validation",
    );
    await expectCode(
      signUp(conn.db, { username: "longpw", password: "x".repeat(129) }),
      "validation",
    );
    await expectCode(
      signUp(conn.db, { username: undefined, password: undefined }),
      "validation",
    );
  });
});

describe("signIn", () => {
  it("大文字・小文字を区別せずにログインでき、違うパスワードや存在しない名前は同じエラー", async () => {
    const created = await signUp(conn.db, {
      username: "Carol",
      password: PASSWORD,
    });
    const user = await signIn(conn.db, {
      username: "carol",
      password: PASSWORD,
    });
    expect(user.id).toBe(created.id);
    expect(user.username).toBe("Carol");

    await expectCode(
      signIn(conn.db, { username: "carol", password: "wrong-pass" }),
      "invalid_credentials",
    );
    await expectCode(
      signIn(conn.db, { username: "nobody", password: PASSWORD }),
      "invalid_credentials",
    );
    await expectCode(
      signIn(conn.db, { username: "x", password: "" }),
      "invalid_credentials",
    );
  });

  it("15分に10回失敗すると正しいパスワードでも拒否し、時間がたてばログインできる。成功で記録が消える", async () => {
    await signUp(conn.db, { username: "dave", password: PASSWORD });
    const now = new Date("2026-10-11T00:00:00.000Z");
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expectCode(
        signIn(conn.db, { username: "DAVE", password: "wrong-pass" }, now),
        "invalid_credentials",
      );
    }
    await expectCode(
      signIn(conn.db, { username: "dave", password: PASSWORD }, now),
      "too_many_attempts",
    );

    const later = new Date(now.getTime() + LOGIN_WINDOW_MS + 1);
    await signIn(conn.db, { username: "dave", password: PASSWORD }, later);
    const left = await conn.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.usernameLower, "dave"));
    expect(left).toHaveLength(0);
  });

  it("退会済みのユーザーはログインできない", async () => {
    const user = await signUp(conn.db, {
      username: "erin",
      password: PASSWORD,
    });
    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.id));
    await expectCode(
      signIn(conn.db, { username: "erin", password: PASSWORD }),
      "invalid_credentials",
    );
  });
});

describe("セッション", () => {
  it("トークンそのものは保存せず、ハッシュで引ける。削除すると無効になる", async () => {
    const user = await signUp(conn.db, {
      username: "frank",
      password: PASSWORD,
    });
    const { token, expiresAt } = await createSession(conn.db, user.id);
    const stored = await conn.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(stored.map((s) => s.id)).toEqual([sessionIdFromToken(token)]);
    expect(stored[0]?.id).not.toBe(token);

    const found = must(await findSession(conn.db, token));
    expect(found.user).toEqual({
      id: user.id,
      username: "frank",
      displayName: "frank",
    });
    expect(found.expiresAt).toEqual(expiresAt);
    expect(await findSession(conn.db, "unknown-token")).toBeNull();

    await deleteSession(conn.db, token);
    expect(await findSession(conn.db, token)).toBeNull();
  });

  it("期限切れと退会済みのセッションは無効", async () => {
    const user = await signUp(conn.db, {
      username: "grace",
      password: PASSWORD,
    });
    const now = new Date("2026-10-11T00:00:00.000Z");
    const { token } = await createSession(conn.db, user.id, now);
    expect(await findSession(conn.db, token, now)).not.toBeNull();
    expect(
      await findSession(
        conn.db,
        token,
        new Date(now.getTime() + SESSION_TTL_MS),
      ),
    ).toBeNull();

    await conn.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.id));
    expect(await findSession(conn.db, token, now)).toBeNull();
  });

  it("残りが15日を切ったときだけ、期限を30日先へ延ばす", async () => {
    const user = await signUp(conn.db, {
      username: "heidi",
      password: PASSWORD,
    });
    const now = new Date("2026-10-11T00:00:00.000Z");
    const { token } = await createSession(conn.db, user.id, now);
    const session = must(await findSession(conn.db, token, now));

    const day = 24 * 3600 * 1000;
    expect(
      await renewSessionIfNeeded(
        conn.db,
        session,
        new Date(now.getTime() + 10 * day),
      ),
    ).toBeNull();

    const later = new Date(now.getTime() + 20 * day);
    const renewed = must(await renewSessionIfNeeded(conn.db, session, later));
    expect(renewed.getTime()).toBe(later.getTime() + SESSION_TTL_MS);
    expect(must(await findSession(conn.db, token, later)).expiresAt).toEqual(
      renewed,
    );
  });
});
