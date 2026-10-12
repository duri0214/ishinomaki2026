ALTER TABLE "posts" ADD COLUMN "parent_post_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_post_id_posts_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_parent_created_idx" ON "posts" USING btree ("parent_post_id","created_at","id");