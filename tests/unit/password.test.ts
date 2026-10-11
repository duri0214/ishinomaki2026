import { describe, expect, it } from "vitest";
import {
  hashPassword,
  parsePasswordHash,
  UNUSABLE_PASSWORD_HASH,
  verifyPassword,
} from "@/features/auth/password";

describe("パスワードのハッシュ", () => {
  it("同じパスワードでもソルトが違うので毎回別の値になり、どちらでも照合できる", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("correct horse", b)).toBe(true);
  });

  it("違うパスワードとは一致しない", async () => {
    const hash = await hashPassword("password-1");
    expect(await verifyPassword("password-2", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("保存形式にパラメータを含む", async () => {
    const hash = await hashPassword("x".repeat(8));
    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
    const parsed = parsePasswordHash(hash);
    expect(parsed?.salt).toHaveLength(16);
    expect(parsed?.hash).toHaveLength(64);
  });

  it("形式が不正な値（ログイン不可の印など）とは常に一致しない", async () => {
    expect(parsePasswordHash(UNUSABLE_PASSWORD_HASH)).toBeNull();
    expect(await verifyPassword("anything", UNUSABLE_PASSWORD_HASH)).toBe(
      false,
    );
    expect(await verifyPassword("x", "scrypt$a$b$c$$")).toBe(false);
  });
});
