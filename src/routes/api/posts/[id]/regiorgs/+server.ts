import { desc, eq } from 'drizzle-orm';
import { db, regiorgs, users } from '#lib/server/db/index.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

/** Who regiorged a post, latest first. */
export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) return new Response('Not found', { status: 404 });

	const response = await db
		.select({ username: users.username, name: users.name, avatar: users.avatar })
		.from(regiorgs)
		.innerJoin(users, eq(users.id, regiorgs.user_id))
		.where(eq(regiorgs.post_id, id))
		.orderBy(desc(regiorgs.created_at));
	return Response.json(response);
};
