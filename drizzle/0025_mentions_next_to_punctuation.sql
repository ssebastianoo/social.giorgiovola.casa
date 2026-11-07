-- a mention can sit next to punctuation, "(@user)" or "@user," notify too. The "@" just can't
-- follow a username character, "@" or "/", so emails (a@b.com) and post links (/@user/57) aren't
-- mentions. Same rule as MENTION_RE in src/lib/mentions.ts; the rest is the function from 0011.
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
            FROM regexp_matches(NEW.content, '(?<![a-zA-Z0-9_@/])@([a-zA-Z0-9_]+)', 'g') AS m
            JOIN users ON users.username = m[1]
            WHERE users.id <> NEW.user_id
            ON CONFLICT DO NOTHING;
        END IF;
    RETURN NULL;
    END;
$notify_posts$ LANGUAGE plpgsql;
