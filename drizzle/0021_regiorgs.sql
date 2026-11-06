CREATE TABLE "regiorgs" (
	"user_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regiorgs_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "inbox" DROP CONSTRAINT "inbox_type_check";--> statement-breakpoint
ALTER TABLE "regiorgs" ADD CONSTRAINT "regiorgs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regiorgs" ADD CONSTRAINT "regiorgs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regiorgs_post_id" ON "regiorgs" USING btree ("post_id");--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_type_check" CHECK ("inbox"."type" IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you', 'follow', 'regiorg'));--> statement-breakpoint
-- A regiorg notifies the author of the post, like the other notifications it is created by the
-- database. Regiorging your own post doesn't notify you.
CREATE OR REPLACE FUNCTION notify_regiorg() RETURNS TRIGGER AS $notify_regiorg$
    BEGIN
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        SELECT posts.user_id, NEW.user_id, NEW.post_id, 'regiorg'
        FROM posts
        WHERE posts.id = NEW.post_id AND posts.user_id <> NEW.user_id
        ON CONFLICT DO NOTHING;
    RETURN NULL;
    END;
$notify_regiorg$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS regiorgs_notification ON regiorgs;
--> statement-breakpoint
CREATE TRIGGER regiorgs_notification
    AFTER INSERT ON regiorgs
    FOR EACH ROW EXECUTE function notify_regiorg();
