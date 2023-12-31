import { hashPassword } from './src/lib/server/password';

import postgres from 'postgres';

const sql = postgres(Bun.env.DATABASE_URL);

// @ts-ignore
const username: string = Bun.argv[2];

// @ts-ignore
const password: string = Bun.argv[3];

const { salt, hash } = await hashPassword(password);

await sql`
    UPDATE users
    SET password = ${hash}, salt = ${salt}
    WHERE username = ${username}
`;

const users = await sql`
    SELECT id
    FROM users
    WHERE username = ${username}
`;

await sql`
    DELETE FROM sessions
    WHERE user_id = ${users[0].id}
`;
