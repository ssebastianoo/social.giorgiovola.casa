import type { RequestHandler } from './$types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, inbox } from '#lib/server/db/index.js';
import { pushUnread } from '#lib/server/realtime.js';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	await db
		.update(inbox)
		.set({ read_at: sql`NOW()` })
		.where(and(eq(inbox.user_id, locals.user.id), isNull(inbox.read_at)));
	void pushUnread([locals.user.id]);
	return new Response();
};
