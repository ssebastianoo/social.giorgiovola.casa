import type { RequestHandler } from './$types';
import { getGroup, markGroupRead } from '#lib/server/groups.js';
import { pushUnreadMessages } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response(null, { status: 404 });
	if (await markGroupRead(group.id, locals.user.id)) void pushUnreadMessages(locals.user.id);
	return new Response();
};
