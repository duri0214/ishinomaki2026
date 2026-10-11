import {
  randomBytes,
  type ScryptOptions,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

/**
 * パスワードのハッシュ化と照合（node:crypto の scrypt）。
 * 保存形式は `scrypt$N$r$p$salt(base64)$hash(base64)`。パラメータを含めるので、後で強度を上げても古いハッシュを検証できる。
 */

const N = 2 ** 14;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** どのパスワードとも一致しない値（シードのユーザーなど、ログインさせない行に使う） */
export const UNUSABLE_PASSWORD_HASH = "!";

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, keyLength, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

type Parsed = { n: number; r: number; p: number; salt: Buffer; hash: Buffer };

export function parsePasswordHash(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const hash = Buffer.from(parts[5] ?? "", "base64");
  if (!n || !r || !p || salt.length === 0 || hash.length === 0) return null;
  return { n, r, p, salt, hash };
}

/** 照合する。形式が不正な値（UNUSABLE_PASSWORD_HASH など）とは常に一致しない */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.hash.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });
  return timingSafeEqual(key, parsed.hash);
}

let dummyHash: Promise<string> | undefined;

/** 存在しないユーザー名でも同じだけ時間をかけ、応答時間でユーザー名の有無が分からないようにする */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password");
  await verifyPassword(password, await dummyHash);
}
