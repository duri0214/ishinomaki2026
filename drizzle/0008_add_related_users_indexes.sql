CREATE INDEX "live_records_event_idx" ON "live_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "user_favorite_islands_island_idx" ON "user_favorite_islands" USING btree ("island_id");--> statement-breakpoint
CREATE INDEX "user_favorite_members_tag_idx" ON "user_favorite_members" USING btree ("tag_id");