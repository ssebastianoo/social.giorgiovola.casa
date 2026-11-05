-- replying to, liking or mentioning yourself no longer notifies you (issue #23). Only the inserts
-- changed: the mention handling is the one from 0003 and the ratio handling the one from 0005.
-- The rows are now inserted with INSERT ... SELECT so a self-notification can simply be skipped.

CREATE OR REPLACE FUNCTION notify_posts() RETURNS TRIGGER AS $notify_posts$
    BEGIN
        IF NEW.reply_to IS NOT NULL THEN
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            SELECT posts.user_id, NEW.user_id, NEW.id, 'reply'
            FROM posts
            WHERE posts.id = NEW.reply_to AND posts.user_id <> NEW.user_id
            ON CONFLICT DO NOTHING;
        ELSE
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            SELECT DISTINCT users.id, NEW.user_id, NEW.id, 'mention'
            FROM regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)(?:\s|$)', 'g') AS m
            JOIN users ON users.username = m[1]
            WHERE users.id <> NEW.user_id
            ON CONFLICT DO NOTHING;
        END IF;
    RETURN NULL;
    END;
$notify_posts$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_like() RETURNS TRIGGER AS $notify_like$
    DECLARE
        reply_author integer;
        parent_author integer;
        reply_likes integer;
        parent_likes integer;
    BEGIN
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        SELECT posts.user_id, NEW.user_id, NEW.post_id, 'like'
        FROM posts
        WHERE posts.id = NEW.post_id AND posts.user_id <> NEW.user_id
        ON CONFLICT DO NOTHING;

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
