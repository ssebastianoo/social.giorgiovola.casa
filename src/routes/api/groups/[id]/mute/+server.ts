import type { RequestHandler } from './$types';
import { getGroup, setGroupMuted } from '#lib/server/groups.js';
import { pushUnreadMessages } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** Mutes (POST) or unmutes (DELETE) the group, for you only. */
async function toggle(locals: App.Locals, rawId: string, muted: boolean) {
	if (!locals.user) return new Response(null, { status: 401 });
	const id = parseId(rawId);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response(null, { status: 404 });
	await setGroupMuted(group.id, locals.user.id, muted);
	// its unread messages leave or join the badge
	void pushUnreadMessages(locals.user.id);
	return new Response(null, { status: 204 });
}

export const POST: RequestHandler = ({ locals, params }) => toggle(locals, params.id, true);
export const DELETE: RequestHandler = ({ locals, params }) => toggle(locals, params.id, false);
