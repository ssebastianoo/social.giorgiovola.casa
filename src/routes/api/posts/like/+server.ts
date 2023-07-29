import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}
	
	const user = locals.user;
	const { id } = await request.json();
	if (!id) {
		return new Response(null, { status: 400 });
	}

	const liked = await sql.begin(async (sql) => {
		const res = await sql`
        INSERT INTO likes (user_id, post_id)
        VALUES (${user.id}, ${id})
        ON CONFLICT (user_id, post_id) DO NOTHING
        RETURNING *
        `;
		if (res.length === 0) {
			// no action, delete like
			await sql`
            DELETE FROM likes
            WHERE user_id = ${user.id} AND post_id = ${id}
            `;
			return false;
		} else {
			// post has been liked
			return true;
		}
	});

	return new Response(JSON.stringify({ liked }));
};
