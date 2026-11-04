import { eq } from 'drizzle-orm';
import { db, likes, users } from '#lib/server/db/index.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) return new Response('Not found', { status: 404 });

	const response = await db
		.select({ username: users.username, name: users.name, avatar: users.avatar })
		.from(likes)
		.innerJoin(users, eq(users.id, likes.user_id))
		.where(eq(likes.post_id, id));
	return new Response(JSON.stringify(response), {
		headers: { 'Content-Type': 'application/json' }
	});
};
