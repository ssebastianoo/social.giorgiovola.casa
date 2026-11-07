import { redirect } from '@sveltejs/kit';
import { getGroup, toGroupChat } from '#lib/server/groups.js';
import { parseId } from '#lib/server/validation.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:group');
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) redirect(303, '/messages');
	return { group: toGroupChat(group) };
}) satisfies PageServerLoad;
