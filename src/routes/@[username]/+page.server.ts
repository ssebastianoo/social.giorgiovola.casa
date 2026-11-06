import type { Actions, PageServerLoad } from './$types';
import { eq, isNotNull } from 'drizzle-orm';
import { db, posts as postsTable, users as usersTable } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import type { User } from '#lib/types.js';
import { getPinnedId, getPosts, getTimeline, profileAuthor } from '#lib/server/posts.js';
import { PAGE_SIZE, pageOffset } from '#lib/server/paging.js';
import { getFollowedBy, getFollowStats } from '#lib/server/follows.js';
import { canModerate, findTarget, isStaff } from '#lib/server/moderation.js';

type Tab = 'posts' | 'replies';

const pickTab = (url: URL): Tab =>
	url.searchParams.get('tab') === 'replies' ? 'replies' : 'posts';

// posts (with regiorgs) and replies are separate tabs; the pinned post sits above the posts tab
function tabPosts(
	tab: Tab,
	username: string,
	loggedUser: App.Locals['user'],
	pinnedId: number | null,
	offset = 0
) {
	if (tab === 'replies')
		return getPosts({
			loggedUser,
			fromUser: { username },
			where: isNotNull(postsTable.reply_to),
			order: 'DESC',
			limit: PAGE_SIZE,
			offset
		});
	return getTimeline({
		loggedUser,
		authors: profileAuthor(username),
		excludeReplies: true,
		excludeId: pinnedId,
		limit: PAGE_SIZE,
		offset
	});
}

export const load = (async ({ params, locals, depends, url }) => {
	const username = params.username.toLowerCase();
	depends('app:posts');

	const users = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			username: usersTable.username,
			avatar: usersTable.avatar,
			bio: usersTable.bio,
			website: usersTable.website,
			created_at: usersTable.created_at,
			email: usersTable.email,
			owner_id: usersTable.owner_id,
			bot: usersTable.bot
		})
		.from(usersTable)
		.where(eq(usersTable.username, username));

	if (users.length === 0) {
		error(404, 'User not found');
	}

	let user: User;

	if (locals.user?.username !== username) {
		user = {
			id: 0,
			email: '',
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at,
			// who owns an identity is private
			owner_id: null
		};
	} else {
		user = {
			id: users[0].id,
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at,
			email: users[0].email,
			owner_id: users[0].owner_id
		};
	}

	const viewerId = locals.user?.id;
	const tab = pickTab(url);
	const pinnedId = await getPinnedId(users[0].id);
	const [posts, pinned, follow, followedBy] = await Promise.all([
		tabPosts(tab, username, locals.user, pinnedId),
		pinnedId !== null && tab === 'posts'
			? getPosts({ loggedUser: locals.user, postId: pinnedId }).then((p) => p[0] ?? null)
			: null,
		getFollowStats(users[0].id, viewerId),
		// mutuals: profiles the viewer follows that follow this one
		viewerId ? getFollowedBy(users[0].id, viewerId) : { users: [], total: 0 }
	]);
	// staff see the moderation controls on profiles they are allowed to act on
	let moderation: {
		banned: boolean;
		muted: boolean;
		ban_reason: string | null;
		mute_reason: string | null;
		identity: boolean;
	} | null = null;
	if (isStaff(locals.role)) {
		const target = await findTarget(username);
		if (target && canModerate(locals, target)) {
			moderation = {
				banned: target.banned_at !== null,
				muted: target.muted_at !== null,
				ban_reason: target.ban_reason,
				mute_reason: target.mute_reason,
				identity: target.username !== username
			};
		}
	}

	return {
		user,
		bio: users[0].bio,
		bot: users[0].bot,
		website: users[0].website,
		tab,
		posts,
		pinned,
		follow,
		followedBy,
		moderation,
		self: locals.user && locals.user.username === user.username
	};
}) satisfies PageServerLoad;

export const actions = {
	// infinite scroll of the open tab; the Posts component posts to the current URL, tab included
	async default({ params, locals, request, url }) {
		const username = params.username.toLowerCase();
		const [owner] = await db
			.select({ pinned: usersTable.pinned_post_id })
			.from(usersTable)
			.where(eq(usersTable.username, username));
		const posts = await tabPosts(
			pickTab(url),
			username,
			locals.user,
			owner?.pinned ?? null,
			await pageOffset(request)
		);
		return { posts };
	}
} satisfies Actions;
