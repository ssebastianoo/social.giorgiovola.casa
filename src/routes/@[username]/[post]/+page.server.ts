import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';

export const load = (async ({ params, locals }) => {
	const posts = await getPosts({ loggedUser: locals.user, postId: parseInt(params.post) });

	if (posts.length === 0) {
		throw error(404, 'Post not found');
	}

	return {
		post: posts[0],
		streamed: {
			replies: getPosts({ loggedUser: locals.user, reply_to: parseInt(params.post), order: 'ASC' })
		}
	};
}) satisfies PageServerLoad;
