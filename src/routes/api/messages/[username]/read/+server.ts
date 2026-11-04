import type { RequestHandler } from './$types';
import { findPeer, markThreadRead } from '#lib/server/messages.js';
import { pushUnreadMessages } from '#lib/server/realtime.js';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	const peer = await findPeer(params.username);
	if (!peer) return new Response(null, { status: 404 });
	if (await markThreadRead(locals.user.id, peer.id)) void pushUnreadMessages(locals.user.id);
	return new Response();
};
