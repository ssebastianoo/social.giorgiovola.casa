import type { RequestHandler } from './$types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, inbox } from '#lib/server/db/index.js';
import { pushUnread } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** The post was on the viewer's screen: their mention notification for it is now read. */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	const id = parseId(params.id);
	if (id === null) return new Response(null, { status: 404 });
	const updated = await db
		.update(inbox)
		.set({ read_at: sql`NOW()` })
		.where(
			and(
				eq(inbox.user_id, locals.user.id),
				eq(inbox.post_id, id),
				eq(inbox.type, 'mention'),
				isNull(inbox.read_at)
			)
		)
		.returning({ id: inbox.id });
	if (updated.length > 0) void pushUnread([locals.user.id]);
	return new Response();
};
