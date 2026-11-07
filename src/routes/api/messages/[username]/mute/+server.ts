import type { RequestHandler } from './$types';
import { findPeer, setDmMuted } from '#lib/server/messages.js';
import { pushUnreadMessages } from '#lib/server/realtime.js';

/** Mutes (POST) or unmutes (DELETE) the conversation with this user, for you only. */
async function toggle(locals: App.Locals, username: string, muted: boolean) {
	if (!locals.user) return new Response(null, { status: 401 });
	const peer = await findPeer(username);
	if (!peer) return new Response(null, { status: 404 });
	if (peer.id === locals.user.id) return new Response("You can't mute yourself", { status: 400 });
	await setDmMuted(locals.user.id, peer.id, muted);
	// its unread messages leave or join the badge
	void pushUnreadMessages(locals.user.id);
	return new Response(null, { status: 204 });
}

export const POST: RequestHandler = ({ locals, params }) => toggle(locals, params.username, true);
export const DELETE: RequestHandler = ({ locals, params }) =>
	toggle(locals, params.username, false);
