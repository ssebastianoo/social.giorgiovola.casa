import { redirect } from '@sveltejs/kit';
import { getConversations, mutedPeers } from '#lib/server/messages.js';
import { getGroupConversations } from '#lib/server/groups.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:messages');
	const [conversations, groups, muted] = await Promise.all([
		getConversations(locals.user.id),
		getGroupConversations(locals.user.id),
		mutedPeers(locals.user.id)
	]);
	// muted direct conversations come apart: the shared Conversation type is also the bot API's
	return { conversations, groups, mutedPeers: muted };
}) satisfies PageServerLoad;
