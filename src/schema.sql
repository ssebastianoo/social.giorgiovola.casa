CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        salt TEXT NOT NULL,
        avatar TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    reply_to INTEGER REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS inbox(
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('mention', 'reply', 'like')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    UNIQUE (user_id, sender_id, post_id, type)
);

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

DROP TRIGGER IF EXISTS likes_notification ON likes;
CREATE TRIGGER likes_notification
    AFTER INSERT ON likes
    FOR EACH ROW EXECUTE function notify_like();

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

DROP TRIGGER IF EXISTS posts_notification ON posts;
CREATE TRIGGER posts_notification
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE function notify_posts();