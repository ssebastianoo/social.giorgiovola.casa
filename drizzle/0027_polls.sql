CREATE TABLE "poll_votes" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
	CONSTRAINT "poll_votes_option_check" CHECK ("poll_votes"."option" >= 0)
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"post_id" integer PRIMARY KEY NOT NULL,
	"options" text[] NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "polls_options_check" CHECK (cardinality("polls"."options") BETWEEN 2 AND 4)
);
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_post_id_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;