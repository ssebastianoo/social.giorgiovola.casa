ALTER TABLE "inbox" DROP CONSTRAINT "inbox_type_check";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "quote_of" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "is_quote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_quote_of_posts_id_fk" FOREIGN KEY ("quote_of") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_quote_of" ON "posts" USING btree ("quote_of");--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_type_check" CHECK ("inbox"."type" IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you', 'follow', 'regiorg', 'quote'));--> statement-breakpoint
-- A quote notifies the author of the quoted post, instead of the mention they would get when the
-- quote also @mentions them. Quoting your own post doesn't notify you. posts_notification
-- (mentions) runs first: triggers on the same event fire in name order.
CREATE OR REPLACE FUNCTION notify_quote() RETURNS TRIGGER AS $notify_quote$
    DECLARE
        author integer;
    BEGIN
        SELECT posts.user_id INTO author FROM posts WHERE posts.id = NEW.quote_of;
        IF author IS NULL OR author = NEW.user_id THEN
            RETURN NULL;
        END IF;
        DELETE FROM inbox
        WHERE inbox.user_id = author AND inbox.post_id = NEW.id AND inbox.type = 'mention';
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        VALUES (author, NEW.user_id, NEW.id, 'quote')
        ON CONFLICT DO NOTHING;
    RETURN NULL;
    END;
$notify_quote$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS posts_quote_notification ON posts;
--> statement-breakpoint
CREATE TRIGGER posts_quote_notification
    AFTER INSERT ON posts
    FOR EACH ROW
    WHEN (NEW.quote_of IS NOT NULL)
    EXECUTE function notify_quote();
