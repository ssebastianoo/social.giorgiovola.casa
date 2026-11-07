import { error, redirect } from '@sveltejs/kit';
import { findPeer, getBlock, getThread, isDmMuted } from '#lib/server/messages.js';
import type { PageServerLoad } from './$types';

// Nothing is marked as read here: hover preloading runs this load before the page is opened.
export const load = (async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/login');
	const peer = await findPeer(params.username);
	if (!peer) error(404, 'User not found');
	if (peer.id === locals.user.id) redirect(303, '/messages');

	const { username, name, avatar } = peer;
	const [thread, block, muted] = await Promise.all([
		getThread(locals.user, peer),
		// `me`: I blocked them, `peer`: they blocked me
		getBlock(locals.user.id, peer.id),
		isDmMuted(locals.user.id, peer.id)
	]);
	return { peer: { username, name, avatar }, thread, block, muted };
}) satisfies PageServerLoad;
