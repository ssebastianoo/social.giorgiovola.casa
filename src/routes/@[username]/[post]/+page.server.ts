import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/posts';
import { parseId } from '$lib/server/validation';

export const load = (async ({ params, locals }) => {
	const postId = parseId(params.post);
	if (postId === null) throw error(404, 'Post not found');

	const posts = await getPosts({
		loggedUser: locals.user,
		fromUser: { username: params.username.toLowerCase() },
		postId
	});

	if (posts.length === 0) {
		throw error(404, 'Post not found');
	}

	return {
		post: posts[0],
		streamed: {
			replies:
				posts[0].replies_count > 0
					? getPosts({ loggedUser: locals.user, reply_to: postId, order: 'ASC' })
					: []
		}
	};
}) satisfies PageServerLoad;
