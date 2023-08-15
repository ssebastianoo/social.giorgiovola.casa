import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';

export const load = (async ({ params, locals }) => {
	const posts = await getPosts({
		loggedUser: locals.user,
		fromUser: { username: params.username },
		postId: parseInt(params.post)
	});

	if (posts.length === 0) {
		throw error(404, 'Post not found');
	}

	return {
		post: posts[0],
		streamed: {
			replies:
				posts[0].replies_count > 0
					? getPosts({ loggedUser: locals.user, reply_to: parseInt(params.post), order: 'ASC' })
					: []
		}
	};
}) satisfies PageServerLoad;
