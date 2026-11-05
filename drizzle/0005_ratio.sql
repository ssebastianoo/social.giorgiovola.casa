ALTER TABLE "inbox" DROP CONSTRAINT "inbox_type_check";--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_type_check" CHECK ("inbox"."type" IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you'));--> statement-breakpoint
-- A reply "ratios" its parent when it has more likes than the parent. The like that makes a
-- reply overtake its parent notifies both authors: the parent's ('ratio') and the reply's
-- ('ratioed_by_you'). The inbox unique key keeps it to once per reply, even if the counts
-- cross back and forth. Unlikes on the parent don't notify: only a like does.
CREATE OR REPLACE FUNCTION notify_like() RETURNS TRIGGER AS $notify_like$
    DECLARE
        reply_author integer;
        parent_author integer;
        reply_likes integer;
        parent_likes integer;
    BEGIN
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        VALUES (
            (SELECT posts.user_id FROM posts WHERE id = NEW.post_id),
            NEW.user_id,
            NEW.post_id,
            'like'
        ) ON CONFLICT DO NOTHING;

        SELECT reply.user_id, parent.user_id,
               (SELECT COUNT(*) FROM likes WHERE likes.post_id = reply.id),
               (SELECT COUNT(*) FROM likes WHERE likes.post_id = parent.id)
        INTO reply_author, parent_author, reply_likes, parent_likes
        FROM posts reply
        JOIN posts parent ON parent.id = reply.reply_to
        WHERE reply.id = NEW.post_id;

        IF FOUND
            AND reply_author IS NOT NULL
            AND parent_author IS NOT NULL
            AND reply_author != parent_author
            AND reply_likes > parent_likes
        THEN
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            VALUES
                (parent_author, reply_author, NEW.post_id, 'ratio'),
                (reply_author, parent_author, NEW.post_id, 'ratioed_by_you')
            ON CONFLICT DO NOTHING;
        END IF;
    RETURN NULL;
    END;
$notify_like$ LANGUAGE plpgsql;
