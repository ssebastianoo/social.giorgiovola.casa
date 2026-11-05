CREATE TABLE "follows" (
	"follower_id" integer NOT NULL,
	"followed_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "follows_not_self" CHECK ("follows"."follower_id" != "follows"."followed_id")
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_id_users_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_followed_id" ON "follows" USING btree ("followed_id");