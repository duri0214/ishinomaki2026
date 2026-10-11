CREATE TABLE "live_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"island_id" uuid NOT NULL,
	"title" text NOT NULL,
	"venue" text NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "live_events_island_title_uq" UNIQUE("island_id","title")
);
--> statement-breakpoint
CREATE TABLE "live_records" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_records_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_island_id_islands_id_fk" FOREIGN KEY ("island_id") REFERENCES "public"."islands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_records" ADD CONSTRAINT "live_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_records" ADD CONSTRAINT "live_records_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO live_events (island_id, title, venue, starts_at)
SELECT i.id, d.title, d.venue, d.starts_at::timestamptz
FROM islands i CROSS JOIN (VALUES
('【デモ】Spring Bloom 2026', '東京・星空ホール（架空）', '2026-04-18T18:00:00+09:00'),
('【デモ】Summer Spark Tour', '大阪・虹色アリーナ（架空）', '2026-08-22T17:00:00+09:00'),
('【デモ】Autumn Melody', '仙台・月あかりホール（架空）', '2026-10-03T18:30:00+09:00')
) AS d(title, venue, starts_at) ON CONFLICT DO NOTHING;
