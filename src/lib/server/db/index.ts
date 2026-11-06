import { DATABASE_URL } from '$app/env/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// DATABASE_URL is required at runtime (validated in src/env.ts), empty only during `vite build`
const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
export { schema };
export const {
	users,
	sessions,
	posts,
	post_hashtags,
	likes,
	inbox,
	messages,
	blocks,
	follows,
	identity_members,
	settings,
	push_subscriptions,
	passkeys,
	bots
} = schema;
