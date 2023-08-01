import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';

export const load = (async ({ locals, depends }) => {
	depends('app:posts');

	const posts = await getPosts({ loggedUser: locals.user, excludeReplies: true });

	return {
		posts
	};
}) satisfies PageServerLoad;
