import { z } from "zod";
import { codePointLength } from "@/features/tags/normalize";

/** クライアント（フォームの表示）とサーバー（検証）の両方で使う */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 50;

/** シードのダミーユーザー用に予約した接頭辞（大文字・小文字を区別しない） */
export const RESERVED_USERNAME_PREFIX = "seed_";

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^[A-Za-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`),
    `ユーザー名は半角英数字と _ で${USERNAME_MIN}〜${USERNAME_MAX}文字にしてください`,
  );

/** 新規登録のときだけ、予約した接頭辞を拒否する（ログインでは既存の名前をそのまま照合する） */
export const newUsernameSchema = usernameSchema.refine(
  (s) => !s.toLowerCase().startsWith(RESERVED_USERNAME_PREFIX),
  "このユーザー名は使えません",
);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `パスワードは${PASSWORD_MIN}文字以上にしてください`)
  .max(PASSWORD_MAX, `パスワードは${PASSWORD_MAX}文字以内にしてください`);

export const displayNameSchema = z
  .string()
  .trim()
  .refine((s) => s.length > 0, "表示名を入力してください")
  .refine(
    (s) => codePointLength(s) <= DISPLAY_NAME_MAX,
    `表示名は${DISPLAY_NAME_MAX}文字以内にしてください`,
  );

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const signUpInputSchema = z.object({
  username: newUsernameSchema,
  password: passwordSchema,
});
