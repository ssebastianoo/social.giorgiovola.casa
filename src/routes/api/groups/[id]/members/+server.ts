import type { RequestHandler } from './$types';
import {
	addMembers,
	getGroup,
	manageLimited,
	parseUsernames,
	resolveNewMembers
} from '#lib/server/groups.js';
import { publishGroupUpdated } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** Adds people to the group: `{ usernames: [username, …] }`. Any member can. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	const json = await request.json().catch(() => null);
	const usernames = parseUsernames(json?.usernames);
	if (!usernames || usernames.length === 0)
		return new Response('Invalid usernames', { status: 400 });
	const limited = manageLimited(locals.user.id);
	if (limited) return limited;

	const ids = await resolveNewMembers(locals.user.id, usernames);
	if (ids instanceof Response) return ids;
	const result = await addMembers(group.id, locals.user.id, ids);
	if ('error' in result) return new Response(result.error, { status: 400 });

	if (result.added.length > 0)
		void publishGroupUpdated(
			group.id,
			[...group.members.map((m) => m.id), ...result.added],
			result.events
		);
	return new Response(null, { status: 204 });
};
