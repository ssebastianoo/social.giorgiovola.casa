import type { RequestHandler } from './$types';
import { findPeer, getBlock } from '#lib/server/messages.js';
import { getGroup } from '#lib/server/groups.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { publishTyping } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

// the composer sends one every few seconds while someone is writing
const WINDOW_MS = 60_000;
const MAX_TYPING = 40;

/**
 * Tells the other side you are writing: `{ to: username }` in a direct conversation, or
 * `{ group: id }` in a group chat. Nothing is stored; the indicator fades out on its own.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	// muted users can't send messages, so they aren't writing one either
	if (locals.muted) return new Response(null, { status: 204 });
	const key = `typing:${locals.user.id}`;
	if (isLimited(key, MAX_TYPING)) return new Response(null, { status: 429 });
	hit(key, WINDOW_MS);

	const json = await request.json().catch(() => null);
	if (json?.group != null) {
		const id = parseId(json.group);
		const group = id === null ? null : await getGroup(id, locals.user.id);
		if (!group) return new Response('Group not found', { status: 404 });
		publishTyping(
			locals.user,
			group.members.map((m) => m.id),
			group.id
		);
		return new Response(null, { status: 204 });
	}

	const peer = typeof json?.to === 'string' ? await findPeer(json.to) : null;
	if (!peer) return new Response('User not found', { status: 404 });
	const block = await getBlock(locals.user.id, peer.id);
	// blocked either way: they can't get your messages, so they don't see you writing either
	if (!block.me && !block.peer) publishTyping(locals.user, [peer.id], null);
	return new Response(null, { status: 204 });
};
