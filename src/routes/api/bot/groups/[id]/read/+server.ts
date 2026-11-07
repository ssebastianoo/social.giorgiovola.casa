import type { RequestHandler } from './$types';
import { botGroup, botHandler } from '#lib/server/bots.js';
import { markGroupRead } from '#lib/server/groups.js';

/** Marks the whole group as read for the bot. Idempotent. */
export const POST: RequestHandler = botHandler(async ({ user }, { params }) => {
	const group = await botGroup(user, params.id);
	if (group instanceof Response) return group;
	await markGroupRead(group.id, user.id);
	return Response.json({ read: true });
});
