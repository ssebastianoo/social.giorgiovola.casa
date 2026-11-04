import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';
import { PAGE_SIZE, pageOffset } from '$lib/server/paging';
import type { Actions } from '@sveltejs/kit';

const criteria = {
	excludeReplies: true,
	order: 'DESC',
	limit: PAGE_SIZE
} as const;

export const load = (async ({ locals, depends }) => {
	depends('app:posts');

	const posts = await getPosts({ ...criteria, loggedUser: locals.user });

	return {
		posts
	};
}) satisfies PageServerLoad;

export const actions = {
	async default({ locals, request }) {
		const posts = await getPosts({
			...criteria,
			loggedUser: locals.user,
			offset: await pageOffset(request)
		});
		return {
			posts
		};
	}
} satisfies Actions;
