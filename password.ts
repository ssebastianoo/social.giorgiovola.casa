// Usage: bun password.ts <username> <new password>
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashPassword } from './src/lib/server/password';
import { sessions, users } from './src/lib/server/db/schema';

const client = postgres(Bun.env.DATABASE_URL);
const db = drizzle(client);

// @ts-ignore
const username: string = Bun.argv[2];

// @ts-ignore
const password: string = Bun.argv[3];

const { salt, hash } = await hashPassword(password);

await db.update(users).set({ password: hash, salt }).where(eq(users.username, username));

const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));

// log the user out everywhere
await db.delete(sessions).where(eq(sessions.user_id, user.id));

await client.end();
