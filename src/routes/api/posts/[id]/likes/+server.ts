import { sql } from '#lib/server/db.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) return new Response('Not found', { status: 404 });

	const response = await sql`
    SELECT
    users.username,
    users.name,
    users.avatar
    FROM likes
    INNER JOIN users ON users.id = likes.user_id
    WHERE likes.post_id = ${id}
    `;
	return new Response(JSON.stringify(response), {
		headers: { 'Content-Type': 'application/json' }
	});
};
