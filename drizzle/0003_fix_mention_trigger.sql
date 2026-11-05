-- regexp_matches(..., 'g') returns one row per match, so assigning it to a variable failed with
-- "more than one row returned by a subquery" as soon as a post mentioned two users. Mentions of
-- usernames that don't exist also failed, inserting a NULL inbox.user_id.
-- Now every existing mentioned user is notified once, and unknown usernames are skipped.

CREATE OR REPLACE FUNCTION notify_posts() RETURNS TRIGGER AS $notify_posts$
    BEGIN
        IF NEW.reply_to IS NOT NULL THEN
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            VALUES (
                (SELECT posts.user_id FROM posts WHERE id = NEW.reply_to),
                NEW.user_id,
                NEW.id,
                'reply'
            ) ON CONFLICT DO NOTHING;
        ELSE
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            SELECT DISTINCT users.id, NEW.user_id, NEW.id, 'mention'
            FROM regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)(?:\s|$)', 'g') AS m
            JOIN users ON users.username = m[1]
            ON CONFLICT DO NOTHING;
        END IF;
    RETURN NULL;
    END;
$notify_posts$ LANGUAGE plpgsql;
