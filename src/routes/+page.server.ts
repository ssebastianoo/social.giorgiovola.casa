import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';
import type { Actions } from '@sveltejs/kit';

const criteria = {
	excludeReplies: true
};

export const load = (async ({ locals, depends }) => {
	depends('app:posts');

	const posts = await getPosts({ ...criteria, loggedUser: locals.user });

	return {
		posts
	};
}) satisfies PageServerLoad;

export const actions = {
	async loadMore({ locals, request }) {
		const json = await request.json();
		if (!json.currentPage) {
			return new Response('Missing current page', { status: 400 });
		}
		const posts = await getPosts({
			...criteria,
			loggedUser: locals.user,
			limit: 10,
			offset: json.currentPage * 10
		});
	}
} satisfies Actions;
