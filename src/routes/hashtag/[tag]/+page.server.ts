import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { normalizeTag, parseHashtag } from '#lib/hashtags.js';
import { getPosts } from '#lib/server/posts.js';
import { PAGE_SIZE, pageOffset } from '#lib/server/paging.js';
import { hashtagPosts } from '#lib/server/search.js';

/** The normalized tag of the URL, or a 404 when it isn't a hashtag. */
function tagOf(param: string) {
	const parsed = parseHashtag('#' + param);
	if (!parsed || parsed.rest) error(404, 'Not a hashtag');
	return normalizeTag(parsed.tag);
}

export const load = (async ({ params, locals, depends }) => {
	depends('app:posts');
	const tag = tagOf(params.tag);
	const [posts, count] = await Promise.all([
		getPosts({ loggedUser: locals.user, hashtag: tag, order: 'DESC', limit: PAGE_SIZE }),
		hashtagPosts(tag)
	]);
	return { tag, posts, count };
}) satisfies PageServerLoad;

export const actions = {
	// infinite scroll
	async default({ params, locals, request }) {
		const posts = await getPosts({
			loggedUser: locals.user,
			hashtag: tagOf(params.tag),
			order: 'DESC',
			limit: PAGE_SIZE,
			offset: await pageOffset(request)
		});
		return { posts };
	}
} satisfies Actions;
