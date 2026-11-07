import type { RequestHandler } from './$types';
import { getGroup } from '#lib/server/groups.js';
import {
	isGroupMessage,
	parseEmoji,
	reactionLimited,
	setReaction
} from '#lib/server/messageReactions.js';
import { publishGroupMessageReactions } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/**
 * Reacts to a message of the group: PUT `{ id, emoji }` sets your reaction (replacing the one
 * you had), DELETE `{ id }` removes it. Returns `{ reactions }`.
 */
async function react(locals: App.Locals, rawGroupId: string, request: Request, remove: boolean) {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const json = await request.json().catch(() => null);
	const id = parseId(json?.id);
	if (id === null) return new Response('Missing message id', { status: 400 });
	const emoji = remove ? null : parseEmoji(json?.emoji);
	if (!remove && emoji === null) return new Response('Invalid emoji', { status: 400 });

	const groupId = parseId(rawGroupId);
	const group = groupId === null ? null : await getGroup(groupId, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });
	if (!(await isGroupMessage(group.id, id))) {
		return new Response('Message not found', { status: 404 });
	}
	const limited = reactionLimited(locals.user.id);
	if (limited) return limited;

	const reactions = await setReaction('group', id, locals.user.id, emoji);
	publishGroupMessageReactions(
		group.id,
		id,
		reactions,
		group.members.map((m) => m.id)
	);
	return Response.json({ reactions });
}

export const PUT: RequestHandler = ({ locals, params, request }) =>
	react(locals, params.id, request, false);
export const DELETE: RequestHandler = ({ locals, params, request }) =>
	react(locals, params.id, request, true);
