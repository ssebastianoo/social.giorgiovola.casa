import type { Actions, PageServerLoad } from './$types';
import { loadFollowPage, moreFollows } from '#lib/server/follows.js';

export const load = (({ params, locals }) =>
	loadFollowPage(params.username, 'followers', locals.user?.id)) satisfies PageServerLoad;

export const actions = {
	default: ({ params, locals, request }) =>
		moreFollows(params.username, 'followers', locals.user?.id, request)
} satisfies Actions;
