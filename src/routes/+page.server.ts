import type { PageServerLoad } from './$types';
import { followedAuthors, getPosts, getTimeline, getTimelinePinned } from '#lib/server/posts.js';
import { followedUsernames } from '#lib/server/follows.js';
import { PAGE_SIZE, pageOffset } from '#lib/server/paging.js';
import type { Actions, Cookies } from '@sveltejs/kit';

type Feed = 'all' | 'following';

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

// "all" already has every post, so only the following feed brings in regiorgs. The posts staff
// pinned to the timeline sit above both feeds, so they are left out of them
function feedPosts(feed: Feed, loggedUser: App.Locals['user'], offset = 0) {
	if (feed === 'following')
		return getTimeline({
			loggedUser,
			authors: followedAuthors(loggedUser!.id),
			excludeReplies: true,
			excludeTimelinePinned: true,
			limit: PAGE_SIZE,
			offset
		});
	return getPosts({
		loggedUser,
		excludeReplies: true,
		excludeTimelinePinned: true,
		order: 'DESC',
		limit: PAGE_SIZE,
		offset
	});
}

export const load = (async ({ locals, depends, url, cookies }) => {
	depends('app:posts');

	const feed = pickFeed(url, cookies, locals.user);
	const [posts, pinned, following] = await Promise.all([
		feedPosts(feed, locals.user),
		getTimelinePinned(locals.user),
		feed === 'following' ? followedUsernames(locals.user!.id) : null
	]);

	return {
		feed,
		posts,
		pinned,
		following
	};
}) satisfies PageServerLoad;

export const actions = {
	// infinite scroll; the Posts component posts to the current URL, feed param included
	async default({ locals, request, url, cookies }) {
		const feed = pickFeed(url, cookies, locals.user);
		return { posts: await feedPosts(feed, locals.user, await pageOffset(request)) };
	}
} satisfies Actions;
