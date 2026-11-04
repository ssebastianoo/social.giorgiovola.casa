import type { RequestHandler } from './$types';
import { findPeer, sendMessage } from '#lib/server/messages.js';
import { publishMessage } from '#lib/server/realtime.js';
import { LIMITS } from '#lib/server/validation.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const json = await request.json().catch(() => null);
	const to = typeof json?.to === 'string' ? json.to : '';
	const content = typeof json?.content === 'string' ? json.content.trim() : '';
	if (!content) return new Response('Missing content', { status: 400 });
	if (content.length > LIMITS.messageContent) {
		return new Response(`Messages can be at most ${LIMITS.messageContent} characters`, {
			status: 400
		});
	}

	const peer = await findPeer(to);
	if (!peer) return new Response('User not found', { status: 404 });
	if (peer.id === locals.user.id) {
		return new Response("You can't message yourself", { status: 400 });
	}

	const message = await sendMessage(locals.user, peer, content);
	void publishMessage(message, locals.user.id, peer.id, locals.user.name);
	return Response.json(message);
};
