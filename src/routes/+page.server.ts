import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import type { Post } from '$lib/types';
import { getPosts } from '$lib/server/posts';

export const load = (async ({ locals, depends }) => {
	depends('app:posts');

	const posts = await getPosts({ loggedUser: locals.user });

	return {
		posts
	};
}) satisfies PageServerLoad;
