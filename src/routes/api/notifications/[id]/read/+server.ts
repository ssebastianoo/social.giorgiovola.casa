import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { db, inbox } from '#lib/server/db/index.js';
import { pushUnread } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	const id = parseId(params.id);
	if (id === null) return new Response(null, { status: 404 });
	await db
		.update(inbox)
		.set({ read_at: sql`NOW()` })
		.where(and(eq(inbox.id, id), eq(inbox.user_id, locals.user.id)));
	void pushUnread([locals.user.id]);
	return new Response();
};
