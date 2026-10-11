import { z } from "zod";

/** 空文字は「未設定」として扱う（.env に `KEY=` と書かれた場合など） */
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().optional(),
);

const envSchema = z.object({
  /** Neon の接続文字列。未設定ならローカル用の PGlite を使う（本番では必須） */
  DATABASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.url().optional(),
  ),
  /** PGlite のデータ置き場（ローカル専用） */
  PGLITE_DIR: optionalString,
  CLERK_SECRET_KEY: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  /** Webhook を受ける前は発行できないので、本番でも必須にはしない */
  CLERK_WEBHOOK_SIGNING_SECRET: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/** 本番ランタイムで必須になる環境変数 */
const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
] as const satisfies readonly (keyof Env)[];

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * 環境変数を検証する。
 * `strict` のときは本番で必須の変数が欠けていればエラーにする。
 */
export function parseEnv(
  source: Record<string, string | undefined>,
  { strict }: { strict: boolean },
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new EnvError(`環境変数が不正です: ${detail}`);
  }
  if (strict) {
    const missing = REQUIRED_IN_PRODUCTION.filter((k) => !result.data[k]);
    if (missing.length > 0) {
      throw new EnvError(
        `本番に必要な環境変数がありません: ${missing.join(", ")}`,
      );
    }
  }
  return result.data;
}

/**
 * `next build` も NODE_ENV=production で動くため、ビルド中は必須チェックを行わない。
 * 本番サーバーの起動時（instrumentation.ts）と、最初の利用時に検証する。
 */
export function isStrictRuntime(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return (
    source.NODE_ENV === "production" &&
    source.NEXT_PHASE !== "phase-production-build"
  );
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env, { strict: isStrictRuntime() });
  return cached;
}

/** Clerk のキーが揃っているか。揃っていなければ認証まわりは無効（閲覧だけできる） */
export function isClerkConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    source.CLERK_SECRET_KEY?.trim() &&
      source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
  );
}
