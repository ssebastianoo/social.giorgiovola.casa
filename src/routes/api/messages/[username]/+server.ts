import type { RequestHandler } from './$types';
import { findPeer, getThread } from '#lib/server/messages.js';
import { parseId } from '#lib/server/validation.js';

/** A page of the conversation with this user: the latest messages, or older ones with `before`. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const peer = await findPeer(params.username);
	if (!peer) return new Response('User not found', { status: 404 });

	const raw = url.searchParams.get('before');
	const before = raw === null ? null : parseId(raw);
	if (raw !== null && before === null) return new Response('Invalid before', { status: 400 });

	return Response.json(await getThread(locals.user, peer, before));
};
