import type { RequestHandler } from './$types';
import { findPeer, getBlock } from '#lib/server/messages.js';
import {
	isDirectMessageBetween,
	parseEmoji,
	reactionLimited,
	setReaction
} from '#lib/server/messageReactions.js';
import { publishMessageReactions } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/**
 * Reacts to a message of the conversation with this user: PUT `{ id, emoji }` sets your
 * reaction (replacing the one you had), DELETE `{ id }` removes it. Returns `{ reactions }`.
 */
async function react(locals: App.Locals, username: string, request: Request, remove: boolean) {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const json = await request.json().catch(() => null);
	const id = parseId(json?.id);
	if (id === null) return new Response('Missing message id', { status: 400 });
	const emoji = remove ? null : parseEmoji(json?.emoji);
	if (!remove && emoji === null) return new Response('Invalid emoji', { status: 400 });

	const peer = await findPeer(username);
	if (!peer) return new Response('User not found', { status: 404 });
	if (!(await isDirectMessageBetween(id, locals.user.id, peer.id))) {
		return new Response('Message not found', { status: 404 });
	}
	const block = await getBlock(locals.user.id, peer.id);
	if (block.me || block.peer) {
		return new Response("You can't react in this conversation", { status: 403 });
	}
	const limited = reactionLimited(locals.user.id);
	if (limited) return limited;

	const reactions = await setReaction('direct', id, locals.user.id, emoji);
	publishMessageReactions(id, reactions, [locals.user.id, peer.id]);
	return Response.json({ reactions });
}

export const PUT: RequestHandler = ({ locals, params, request }) =>
	react(locals, params.username, request, false);
export const DELETE: RequestHandler = ({ locals, params, request }) =>
	react(locals, params.username, request, true);
