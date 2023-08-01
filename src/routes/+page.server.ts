import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';
import { error, type Actions } from '@sveltejs/kit';

const criteria = {
	excludeReplies: true,
	order: 'DESC'
} as const;

export const load = (async ({ locals, depends }) => {
	depends('app:posts');

	const posts = await getPosts({ ...criteria, loggedUser: locals.user, limit: 10 });

	return {
		posts
	};
}) satisfies PageServerLoad;

export const actions = {
	async default({ locals, request }) {
		const formData = await request.formData();
		if (!formData.has('currentPage')) {
			throw error(400, 'Missing currentPage');
		}
		const posts = await getPosts({
			...criteria,
			loggedUser: locals.user,
			limit: 10,
			offset: (formData.get('currentPage') as unknown as number) * 10
		});
		return {
			posts
		};
	}
} satisfies Actions;
