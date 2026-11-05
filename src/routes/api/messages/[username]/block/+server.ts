import type { RequestHandler } from './$types';
import { findPeer, setBlocked } from '#lib/server/messages.js';

async function toggle(locals: App.Locals, username: string, blocked: boolean) {
	if (!locals.user) return new Response(null, { status: 401 });
	const peer = await findPeer(username);
	if (!peer) return new Response(null, { status: 404 });
	if (peer.id === locals.user.id) return new Response("You can't block yourself", { status: 400 });
	await setBlocked(locals.user.id, peer.id, blocked);
	return new Response();
}

export const POST: RequestHandler = ({ locals, params }) => toggle(locals, params.username, true);
export const DELETE: RequestHandler = ({ locals, params }) =>
	toggle(locals, params.username, false);
