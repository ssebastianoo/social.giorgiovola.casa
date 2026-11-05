import { redirect } from '@sveltejs/kit';
import { getConversations } from '#lib/server/messages.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:messages');
	return { conversations: await getConversations(locals.user.id) };
}) satisfies PageServerLoad;
