import { redirect } from '@sveltejs/kit';
import { getGroup, getGroupThread, isGroupMuted, toGroupChat } from '#lib/server/groups.js';
import { parseId } from '#lib/server/validation.js';
import type { PageServerLoad } from './$types';

// Nothing is marked as read here: hover preloading runs this load before the page is opened.
export const load = (async ({ locals, params, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:group');
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	// gone, or you were removed from it
	if (!group) redirect(303, '/messages');

	const [thread, muted] = await Promise.all([
		getGroupThread(group.id),
		isGroupMuted(group.id, locals.user.id)
	]);
	return { group: toGroupChat(group), thread, muted };
}) satisfies PageServerLoad;
