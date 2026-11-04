import type { RequestHandler } from './$types';
import { sql } from '#lib/server/db.js';
import { pushUnread } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	const id = parseId(params.id);
	if (id === null) return new Response(null, { status: 404 });
	await sql`
        UPDATE inbox SET read_at = NOW() WHERE id = ${id} AND user_id = ${locals.user.id}
    `;
	void pushUnread([locals.user.id]);
	return new Response();
};
