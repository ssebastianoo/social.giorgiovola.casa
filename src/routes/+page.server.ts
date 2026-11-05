import type { PageServerLoad } from './$types';
import { getPosts } from '#lib/server/posts.js';
import { followedUsernames } from '#lib/server/follows.js';
import { PAGE_SIZE, pageOffset } from '#lib/server/paging.js';
import type { Actions, Cookies } from '@sveltejs/kit';

type Feed = 'all' | 'following';

const criteria = {
	excludeReplies: true,
	order: 'DESC',
	limit: PAGE_SIZE
} as const;

// the chosen feed is remembered in a cookie, so the home page opens on it next time
function pickFeed(url: URL, cookies: Cookies, user: App.Locals['user']): Feed {
	if (!user) return 'all';
	const param = url.searchParams.get('feed');
	if (param === 'all' || param === 'following') {
		if (cookies.get('feed') !== param)
			cookies.set('feed', param, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true });
		return param;
	}
	return cookies.get('feed') === 'following' ? 'following' : 'all';
}

export const load = (async ({ locals, depends, url, cookies }) => {
	depends('app:posts');

	const feed = pickFeed(url, cookies, locals.user);
	const followedBy = feed === 'following' ? locals.user!.id : null;
	const [posts, following] = await Promise.all([
		getPosts({ ...criteria, loggedUser: locals.user, followedBy }),
		followedBy != null ? followedUsernames(followedBy) : null
	]);

	return {
		feed,
		posts,
		following
	};
}) satisfies PageServerLoad;

export const actions = {
	// infinite scroll; the Posts component posts to the current URL, feed param included
	async default({ locals, request, url, cookies }) {
		const feed = pickFeed(url, cookies, locals.user);
		const posts = await getPosts({
			...criteria,
			loggedUser: locals.user,
			followedBy: feed === 'following' ? locals.user!.id : null,
			offset: await pageOffset(request)
		});
		return {
			posts
		};
	}
} satisfies Actions;
