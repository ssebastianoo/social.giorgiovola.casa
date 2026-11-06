import type { RequestHandler } from './$types';
import { botError, botHandler } from '#lib/server/bots.js';
import { findPeer, markThreadRead } from '#lib/server/messages.js';

/** Marks everything this user sent to the bot as read. Idempotent. */
export const POST: RequestHandler = botHandler(async ({ user }, { params }) => {
	const peer = await findPeer(params.username);
	if (!peer) return botError(404, 'User not found');
	await markThreadRead(user.id, peer.id);
	return Response.json({ read: true });
});
