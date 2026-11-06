import { desc, eq } from 'drizzle-orm';
import { db, posts, users } from '#lib/server/db/index.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

/** The quote regiorgs of a post, latest first: who quoted it and what they wrote. */
export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) return new Response('Not found', { status: 404 });

	const response = await db
		.select({
			id: posts.id,
			content: posts.content,
			username: users.username,
			name: users.name,
			avatar: users.avatar
		})
		.from(posts)
		.innerJoin(users, eq(users.id, posts.user_id))
		.where(eq(posts.quote_of, id))
		.orderBy(desc(posts.created_at))
		.limit(200);
	return Response.json(response);
};
