-- Notifications are created by the database so they can't be skipped by any code path.
-- Drizzle can't model triggers, hence this hand written migration. It is idempotent
-- (CREATE OR REPLACE / DROP IF EXISTS) because databases created before migrations existed
-- already have these.

CREATE OR REPLACE FUNCTION notify_like() RETURNS TRIGGER AS $notify_like$
    BEGIN
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        VALUES (
            (SELECT posts.user_id FROM posts WHERE id = NEW.post_id),
            NEW.user_id,
            NEW.post_id,
            'like'
        ) ON CONFLICT DO NOTHING;
    RETURN NULL;
    END;
$notify_like$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS likes_notification ON likes;
--> statement-breakpoint
CREATE TRIGGER likes_notification
    AFTER INSERT ON likes
    FOR EACH ROW EXECUTE function notify_like();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_posts() RETURNS TRIGGER AS $notify_posts$
    DECLARE
        matches text[];
        match text;
    BEGIN
        matches = (select regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)(?:\s|$)', 'g'));
        IF NEW.reply_to IS NOT NULL then
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            VALUES (
                    (SELECT posts.user_id FROM posts WHERE id=NEW.reply_to),
                    NEW.user_id,
                    NEW.id,
                    'reply'
                   ) ON CONFLICT DO NOTHING;
        ELSIF matches IS NOT NULL THEN
        FOREACH match in ARRAY matches
            LOOP
                INSERT INTO inbox(user_id, sender_id, post_id, type)
                VALUES (
                (SELECT users.id FROM users where username = match),
                NEW.user_id,
                NEW.id,
                'mention'
                ) ON CONFLICT DO NOTHING ;
            end loop;
        end if;
    RETURN NULL;
    END;
$notify_posts$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS posts_notification ON posts;
--> statement-breakpoint
CREATE TRIGGER posts_notification
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE function notify_posts();
