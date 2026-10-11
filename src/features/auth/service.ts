import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/connect";
import { loginAttempts, sessions, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password";
import { credentialsSchema, signUpInputSchema } from "./validation";

/** DB を使う認証の処理。Cookie は扱わない（src/lib/auth.ts が担当する） */

const DAY_MS = 24 * 3600 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** 残りがこれを切ったら、書き込み操作のときに期限を延ばす */
export const SESSION_RENEW_BEFORE_MS = 15 * DAY_MS;

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
};

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "入力が不正です";
}

/** 一意制約違反(23505)か。ドライバによって元のエラーが cause に入る */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

const lowerUsername = sql`lower(${users.username})`;

export async function findUserByUsername(
  db: Db,
  username: string,
): Promise<typeof users.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(lowerUsername, username.toLowerCase()))
    .limit(1);
  return row;
}

/** 新規登録。表示名の初期値はユーザー名 */
export async function signUp(
  db: Db,
  input: { username: unknown; password: unknown },
): Promise<SessionUser> {
  const parsed = signUpInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("validation", firstIssue(parsed.error));
  const { username, password } = parsed.data;

  const taken = () =>
    new AppError("username_taken", "このユーザー名はすでに使われています");
  if (await findUserByUsername(db, username)) throw taken();
  const passwordHash = await hashPassword(password);
  try {
    const [row] = await db
      .insert(users)
      .values({ username, passwordHash, displayName: username })
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      });
    if (!row) throw new Error("ユーザーの作成に失敗しました");
    return row;
  } catch (err) {
    // 同じ名前の登録が同時に来たとき
    if (isUniqueViolation(err)) throw taken();
    throw err;
  }
}

/** ログイン。失敗は記録し、短時間に失敗が続いたユーザー名は受け付けない */
export async function signIn(
  db: Db,
  input: { username: unknown; password: unknown },
  now: Date = new Date(),
): Promise<SessionUser> {
  const invalid = () =>
    new AppError("invalid_credentials", "ユーザー名かパスワードが違います");
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) throw invalid();
  const { username, password } = parsed.data;
  const key = username.toLowerCase();

  const failures = await db.$count(
    loginAttempts,
    and(
      eq(loginAttempts.usernameLower, key),
      gt(loginAttempts.createdAt, new Date(now.getTime() - LOGIN_WINDOW_MS)),
    ),
  );
  if (failures >= LOGIN_MAX_FAILURES) {
    throw new AppError(
      "too_many_attempts",
      "ログインの失敗が続いたため、しばらく時間をおいてからお試しください",
    );
  }

  const user = await findUserByUsername(db, username);
  let ok = false;
  if (user && !user.deletedAt) {
    ok = await verifyPassword(password, user.passwordHash);
  } else {
    await verifyDummyPassword(password);
  }
  if (!ok || !user) {
    await db
      .delete(loginAttempts)
      .where(lt(loginAttempts.createdAt, new Date(now.getTime() - DAY_MS)));
    await db
      .insert(loginAttempts)
      .values({ usernameLower: key, createdAt: now });
    throw invalid();
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.usernameLower, key));
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

/** Cookie に入れるトークンから、DB に保存する ID を作る */
export function sessionIdFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sessionIdFromToken(token),
    userId,
    createdAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

export type ValidSession = {
  id: string;
  expiresAt: Date;
  user: SessionUser;
};

/** 有効なセッションを返す。期限切れ・退会済みなら null */
export async function findSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ValidSession | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionIdFromToken(token)))
    .limit(1);
  if (!row || row.deletedAt || row.expiresAt <= now) return null;
  return {
    id: row.id,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
    },
  };
}

/** 残りが少なければ期限を延ばし、新しい期限を返す。延ばさなければ null */
export async function renewSessionIfNeeded(
  db: Db,
  session: { id: string; expiresAt: Date },
  now: Date = new Date(),
): Promise<Date | null> {
  if (session.expiresAt.getTime() - now.getTime() > SESSION_RENEW_BEFORE_MS) {
    return null;
  }
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db
    .update(sessions)
    .set({ expiresAt })
    .where(eq(sessions.id, session.id));
  return expiresAt;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionIdFromToken(token)));
}
