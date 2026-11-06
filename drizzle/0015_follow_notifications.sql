ALTER TABLE "inbox" DROP CONSTRAINT "inbox_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_follow_unique" ON "inbox" USING btree ("user_id","sender_id") WHERE "inbox"."type" = 'follow';--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_type_check" CHECK ("inbox"."type" IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you', 'follow'));--> statement-breakpoint
-- A new follower notifies the followed profile, like the other notifications it is created by the
-- database. Follows that existed before this migration don't notify.
CREATE OR REPLACE FUNCTION notify_follow() RETURNS TRIGGER AS $notify_follow$
    BEGIN
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        VALUES (NEW.followed_id, NEW.follower_id, NULL, 'follow')
        ON CONFLICT DO NOTHING;
    RETURN NULL;
    END;
$notify_follow$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS follows_notification ON follows;
--> statement-breakpoint
CREATE TRIGGER follows_notification
    AFTER INSERT ON follows
    FOR EACH ROW EXECUTE function notify_follow();
