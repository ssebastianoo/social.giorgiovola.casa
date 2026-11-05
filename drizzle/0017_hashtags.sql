CREATE TABLE "post_hashtags" (
	"post_id" integer NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "post_hashtags_tag_post_id_pk" PRIMARY KEY("tag","post_id")
);
--> statement-breakpoint
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_hashtags_post_id" ON "post_hashtags" USING btree ("post_id");