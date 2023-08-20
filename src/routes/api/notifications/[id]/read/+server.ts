import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	await sql`
        UPDATE inbox SET read_at = NOW() WHERE id = ${params.id} AND user_id = ${locals.user.id}
    `;
	return new Response();
};
