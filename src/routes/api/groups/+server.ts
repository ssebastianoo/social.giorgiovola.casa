import type { RequestHandler } from './$types';
import {
	createGroup,
	createLimited,
	parseGroupName,
	parseUsernames,
	resolveNewMembers
} from '#lib/server/groups.js';
import { publishGroupUpdated } from '#lib/server/realtime.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { LIMITS } from '#lib/server/validation.js';

/** Creates a group chat: `{ name, members: [username, …] }`, the creator becomes its owner. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });
	const json = await request.json().catch(() => null);

	const parsed = parseGroupName(json?.name);
	if ('error' in parsed) return new Response(parsed.error, { status: 400 });
	const usernames = parseUsernames(json?.members);
	if (!usernames) return new Response('Invalid members', { status: 400 });

	const limited = createLimited(locals.user.id);
	if (limited) return limited;

	const others = await resolveNewMembers(locals.user.id, usernames);
	if (others instanceof Response) return others;
	if (others.length === 0) return new Response('Add at least one other person', { status: 400 });
	if (others.length + 1 > LIMITS.groupMembers)
		return new Response(`Groups can have at most ${LIMITS.groupMembers} members`, {
			status: 400
		});

	const { id, events } = await createGroup(locals.user.id, parsed.name, others);
	// the new group shows up in everyone's conversation list
	void publishGroupUpdated(id, [locals.user.id, ...others], events);
	return Response.json({ id });
};
