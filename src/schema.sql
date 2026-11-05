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

-- sessions expire server side (see src/lib/server/session.ts)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
        -- liking your own post doesn't notify you
        INSERT INTO inbox(user_id, sender_id, post_id, type)
        SELECT posts.user_id, NEW.user_id, NEW.post_id, 'like'
        FROM posts
        WHERE posts.id = NEW.post_id AND posts.user_id <> NEW.user_id
        ON CONFLICT DO NOTHING;
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
            -- replying to your own post doesn't notify you
            INSERT INTO inbox(user_id, sender_id, post_id, type)
            SELECT posts.user_id, NEW.user_id, NEW.id, 'reply'
            FROM posts
            WHERE posts.id = NEW.reply_to AND posts.user_id <> NEW.user_id
            ON CONFLICT DO NOTHING;
        ELSIF matches IS NOT NULL THEN
        FOREACH match in ARRAY matches
            LOOP
                -- mentioning yourself doesn't notify you
                INSERT INTO inbox(user_id, sender_id, post_id, type)
                SELECT users.id, NEW.user_id, NEW.id, 'mention'
                FROM users
                WHERE users.username = match AND users.id <> NEW.user_id
                ON CONFLICT DO NOTHING;
            end loop;
        end if;
    RETURN NULL;
    END;
$notify_posts$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_notification ON posts;
CREATE TRIGGER posts_notification
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE function notify_posts();

-- identities: extra profiles owned by an account, with no email or password of their own.
-- They can only be used by switching to them from the owning account (see src/routes/accounts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ALTER COLUMN salt DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_check;
ALTER TABLE users ADD CONSTRAINT users_identity_check CHECK (
    (owner_id IS NULL AND email IS NOT NULL AND password IS NOT NULL AND salt IS NOT NULL)
    OR (owner_id IS NOT NULL AND owner_id != id AND email IS NULL AND password IS NULL AND salt IS NULL)
);
CREATE INDEX IF NOT EXISTS users_owner_id ON users(owner_id);

-- sessions always belong to an account (user_id); acting_id is the identity currently in use
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS acting_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
