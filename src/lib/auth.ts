import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db";
import {
  findSession,
  renewSessionIfNeeded,
  type SessionUser,
  type ValidSession,
} from "@/features/auth/service";
import { AppError } from "./errors";

export const SESSION_COOKIE = "session";

/** セッションの Cookie を書く。Server Action か Route Handler からだけ呼べる */
export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // ローカルの http でも動かすため、本番だけ Secure にする
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Cookie から有効なセッションを読む。1リクエストにつき1回だけ DB を引く */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  return findSession(await getDb(), token);
});

/** 閲覧者。未ログインなら null */
export async function getViewer(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/** 閲覧者の users.id（いいね済みの判定などに使う）。未ログインなら null */
export async function getViewerId(): Promise<string | null> {
  return (await getSession())?.user.id ?? null;
}

/**
 * 書き込み系で使う。ログインしていなければ unauthorized。
 * 描画中は Cookie を書けないので、セッションの期限延長はここ（Server Action の中）で行う。
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AppError("unauthorized", "ログインが必要です");
  const renewed = await renewSessionIfNeeded(await getDb(), session);
  if (renewed) {
    const token = await getSessionToken();
    if (token) await setSessionCookie(token, renewed);
  }
  return session.user;
}
