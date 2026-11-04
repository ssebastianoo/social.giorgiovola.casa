import { sql } from '$lib/server/db';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}

	const user = locals.user;
	let id: number | null = null;
	try {
		id = parseId((await request.json())?.id);
	} catch {
		// invalid JSON, handled below
	}
	if (id === null) {
		return new Response(null, { status: 400 });
	}
	const postId = id;

	const exists = await sql`SELECT id FROM posts WHERE id = ${postId}`;
	if (exists.length === 0) return new Response(null, { status: 404 });

	const liked = await sql.begin(async (sql) => {
		const res = await sql`
        INSERT INTO likes (user_id, post_id)
        VALUES (${user.id}, ${postId})
        ON CONFLICT (user_id, post_id) DO NOTHING
        RETURNING *
        `;
		if (res.length === 0) {
			// no action, delete like
			await sql`
            DELETE FROM likes
            WHERE user_id = ${user.id} AND post_id = ${postId}
            `;
			return false;
		} else {
			// post has been liked
			return true;
		}
	});

	return new Response(JSON.stringify({ liked }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
