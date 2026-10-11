CREATE TABLE "island_traits" (
	"island_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"score" smallint NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "island_traits_island_id_axis_pk" PRIMARY KEY("island_id","axis"),
	CONSTRAINT "island_traits_score_range" CHECK ("island_traits"."score" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "island_traits" ADD CONSTRAINT "island_traits_island_id_islands_id_fk" FOREIGN KEY ("island_id") REFERENCES "public"."islands"("id") ON DELETE cascade ON UPDATE no action;