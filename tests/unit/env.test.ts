import { describe, expect, it } from "vitest";
import {
  EnvError,
  isClerkConfigured,
  isStrictRuntime,
  parseEnv,
} from "@/lib/env";

const full = {
  DATABASE_URL: "postgres://u:p@host.neon.tech/db",
  CLERK_SECRET_KEY: "sk_test_x",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
};

describe("parseEnv", () => {
  it("開発では何も設定しなくても通る", () => {
    expect(() => parseEnv({}, { strict: false })).not.toThrow();
  });

  it("本番では必須の変数が欠けるとエラーになり、欠けた名前が分かる", () => {
    expect(() => parseEnv({}, { strict: true })).toThrow(EnvError);
    expect(() =>
      parseEnv({ ...full, DATABASE_URL: "" }, { strict: true }),
    ).toThrow(/DATABASE_URL/);
  });

  it("本番でも必須の変数が揃っていれば通る（Webhookシークレットは任意）", () => {
    const env = parseEnv(full, { strict: true });
    expect(env.DATABASE_URL).toBe(full.DATABASE_URL);
    expect(env.CLERK_WEBHOOK_SIGNING_SECRET).toBeUndefined();
  });

  it("空文字は未設定として扱う", () => {
    const env = parseEnv(
      { DATABASE_URL: "", PGLITE_DIR: "  " },
      { strict: false },
    );
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PGLITE_DIR).toBeUndefined();
  });

  it("DATABASE_URL がURLでなければエラーになる", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: "not a url" }, { strict: false }),
    ).toThrow(EnvError);
  });
});

describe("isStrictRuntime", () => {
  it("本番のビルド中は厳密にしない", () => {
    expect(
      isStrictRuntime({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBe(false);
  });
  it("本番のサーバー実行時は厳密にする", () => {
    expect(isStrictRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(
      isStrictRuntime({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-server",
      }),
    ).toBe(true);
  });
  it("開発・テストでは厳密にしない", () => {
    expect(isStrictRuntime({ NODE_ENV: "development" })).toBe(false);
    expect(isStrictRuntime({ NODE_ENV: "test" })).toBe(false);
  });
});

describe("isClerkConfigured", () => {
  it("2つのキーが揃っているときだけ true", () => {
    expect(isClerkConfigured(full)).toBe(true);
    expect(isClerkConfigured({ CLERK_SECRET_KEY: "sk" })).toBe(false);
    expect(isClerkConfigured({})).toBe(false);
  });
});
