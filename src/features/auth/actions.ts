"use server";

import { getDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import {
  clearSessionCookie,
  getSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import {
  createSession,
  deleteSession,
  type SessionUser,
  signIn,
  signUp,
} from "./service";

type Credentials = { username: string; password: string };

async function startSession(user: SessionUser): Promise<SessionUser> {
  const { token, expiresAt } = await createSession(await getDb(), user.id);
  await setSessionCookie(token, expiresAt);
  return user;
}

export async function signUpAction(
  input: Credentials,
): Promise<ActionResult<SessionUser>> {
  return runAction(async () =>
    startSession(
      await signUp(await getDb(), {
        username: input?.username,
        password: input?.password,
      }),
    ),
  );
}

export async function signInAction(
  input: Credentials,
): Promise<ActionResult<SessionUser>> {
  return runAction(async () =>
    startSession(
      await signIn(await getDb(), {
        username: input?.username,
        password: input?.password,
      }),
    ),
  );
}

export async function signOutAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const token = await getSessionToken();
    if (token) await deleteSession(await getDb(), token);
    await clearSessionCookie();
    return null;
  });
}
