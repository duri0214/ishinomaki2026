ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
-- 既存の行を埋める。シードのユーザーは clerk_user_id(seed_user_N) をそのまま使い、次のシード実行で見つけられるようにする
UPDATE "users" SET "username" = CASE WHEN "clerk_user_id" LIKE 'seed\_user\_%' THEN "clerk_user_id" ELSE 'user_' || substr("id"::text, 1, 8) END, "password_hash" = '!';
