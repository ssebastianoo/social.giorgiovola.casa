import postgres from 'postgres';

const url = process.env.DATABASE_URL || '';

const sql = postgres(url);

async function initDB() {
	await sql`
        DROP TABLE IF EXISTS SESSIONS
    `;
	await sql`CREATE TABLE IF NOT EXISTS USERS (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        salt TEXT NOT NULL,
        avatar TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`;
	await sql`CREATE TABLE IF NOT EXISTS SESSIONS (
        token TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER REFERENCES USERS(id) ON DELETE CASCADE
    )`;
	await sql`
        CREATE TABLE IF NOT EXISTS POSTS (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES USERS(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            edited_at TIMESTAMP,
            reply_to INTEGER REFERENCES POSTS(id) ON DELETE CASCADE
        )
    `;

	await sql`
        CREATE TABLE IF NOT EXISTS LIKES (
            user_id INTEGER REFERENCES USERS(id) ON DELETE CASCADE,
            post_id INTEGER REFERENCES POSTS(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
        )
        `;
}

initDB();
