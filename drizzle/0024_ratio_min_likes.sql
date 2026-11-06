-- a reply needs at least 3 likes to ratio its parent. Only the ratio condition changed from 0011.
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
            AND reply_likes >= 3
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
