import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db, follows, users } from './db/index.js';
import type { FollowedBy, FollowListEntry, ProfileCard } from '#lib/types.js';

/** Returns true when this created a follow (rather than finding it already there). */
export async function setFollowing(followerId: number, followedId: number, following: boolean) {
	if (following) {
		const inserted = await db
			.insert(follows)
			.values({ follower_id: followerId, followed_id: followedId })
			.onConflictDoNothing()
			.returning({ id: follows.follower_id });
		return inserted.length > 0;
	}
	await db
		.delete(follows)
		.where(and(eq(follows.follower_id, followerId), eq(follows.followed_id, followedId)));
	return false;
}

/** Follower / following counts of a profile, and whether `viewerId` follows it. */
export async function getFollowStats(userId: number, viewerId?: number | null) {
	const [followers, following, followed] = await Promise.all([
		db.$count(follows, eq(follows.followed_id, userId)),
		db.$count(follows, eq(follows.follower_id, userId)),
		viewerId && viewerId !== userId
			? db.$count(follows, and(eq(follows.follower_id, viewerId), eq(follows.followed_id, userId)))
			: 0
	]);
	return { followers, following, followed: followed > 0 };
}

/** Usernames followed by a profile, so the following feed can filter realtime posts. */
export async function followedUsernames(userId: number) {
	const rows = await db
		.select({ username: users.username })
		.from(follows)
		.innerJoin(users, eq(follows.followed_id, users.id))
		.where(eq(follows.follower_id, userId));
	return rows.map((r) => r.username);
}

const MUTUALS_SHOWN = 3;

/** Profiles `viewerId` follows that follow `userId`: the most recent few, and how many in all. */
export async function getFollowedBy(userId: number, viewerId: number): Promise<FollowedBy> {
	if (userId === viewerId) return { users: [], total: 0 };
	const rows = await db
		.select({
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			total: sql<number>`(COUNT(*) OVER ())::int`
		})
		.from(follows)
		.innerJoin(users, eq(users.id, follows.follower_id))
		.where(and(eq(follows.followed_id, userId), followedByViewer(follows.follower_id, viewerId)))
		.orderBy(desc(follows.created_at))
		.limit(MUTUALS_SHOWN);
	return {
		users: rows.map(({ username, name, avatar }) => ({ username, name, avatar })),
		total: rows[0]?.total ?? 0
	};
}

const followedByViewer = (column: AnyPgColumn, viewerId: number) =>
	sql`${column} IN (SELECT f.followed_id FROM follows f WHERE f.follower_id = ${viewerId})`;

export type FollowList = 'followers' | 'following' | 'known';
export const FOLLOW_PAGE_SIZE = 20;

/**
 * A page of a profile's followers, of the profiles it follows, or of its followers the viewer
 * follows ('known'), most recent first. Public: the viewer only adds the follow state of each row.
 */
export async function listFollows(
	userId: number,
	list: FollowList,
	viewerId: number | null | undefined,
	offset = 0
): Promise<FollowListEntry[]> {
	// the other side of the follow is the profile listed
	const listed = list === 'following' ? follows.followed_id : follows.follower_id;
	const owner = list === 'following' ? follows.follower_id : follows.followed_id;
	if (list === 'known' && !viewerId) return [];
	const viewer = viewerId ?? 0;
	return db
		.select({
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			bio: users.bio,
			followed: sql<boolean>`EXISTS (
				SELECT 1 FROM follows f WHERE f.follower_id = ${viewer} AND f.followed_id = ${users.id}
			)`,
			followsYou: sql<boolean>`EXISTS (
				SELECT 1 FROM follows f WHERE f.follower_id = ${users.id} AND f.followed_id = ${viewer}
			)`,
			self: sql<boolean>`${users.id} = ${viewer}`
		})
		.from(follows)
		.innerJoin(users, eq(users.id, listed))
		.where(and(eq(owner, userId), list === 'known' ? followedByViewer(listed, viewer) : undefined))
		.orderBy(desc(follows.created_at), desc(listed))
		.limit(FOLLOW_PAGE_SIZE)
		.offset(offset);
}

/** What the profile hover card shows. Null when the username doesn't exist. */
export async function getProfileCard(
	username: string,
	viewerId?: number | null
): Promise<ProfileCard | null> {
	const [profile] = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			bio: users.bio,
			website: users.website
		})
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	if (!profile) return null;

	const self = viewerId === profile.id;
	const others = viewerId && !self;
	const [stats, followsYou, followedBy] = await Promise.all([
		getFollowStats(profile.id, viewerId),
		others
			? db.$count(
					follows,
					and(eq(follows.follower_id, profile.id), eq(follows.followed_id, viewerId))
			  )
			: 0,
		others ? getFollowedBy(profile.id, viewerId) : { users: [], total: 0 }
	]);

	return {
		username: profile.username,
		name: profile.name,
		avatar: profile.avatar,
		bio: profile.bio,
		website: profile.website,
		...stats,
		self,
		followsYou: followsYou > 0,
		followedBy
	};
}

/** The followers / following pages: the profile, its counts and the first page of the list. */
export async function loadFollowPage(
	username: string,
	list: FollowList,
	viewerId: number | null | undefined
) {
	const [profile] = await db
		.select({ id: users.id, username: users.username, name: users.name, avatar: users.avatar })
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	if (!profile) error(404, 'User not found');
	const others = !!viewerId && viewerId !== profile.id;
	// the viewer's own profile has no followers they "know" beyond their own list
	if (list === 'known' && !others) redirect(303, `/@${profile.username}/followers`);
	const [stats, followedBy, entries] = await Promise.all([
		getFollowStats(profile.id, viewerId),
		others ? getFollowedBy(profile.id, viewerId) : { users: [], total: 0 },
		listFollows(profile.id, list, viewerId)
	]);
	return {
		profile: { username: profile.username, name: profile.name, avatar: profile.avatar },
		list,
		followers: stats.followers,
		following: stats.following,
		known: followedBy.total,
		// "followers you know" only makes sense for someone else's profile
		showKnown: others,
		entries,
		pageSize: FOLLOW_PAGE_SIZE
	};
}

/** The infinite scroll of a followers / following page (see FollowList.svelte). */
export async function moreFollows(
	username: string,
	list: FollowList,
	viewerId: number | null | undefined,
	request: Request
) {
	const formData = await request.formData();
	const raw = formData.get('offset');
	if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) error(400, 'Invalid offset');
	const [profile] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	if (!profile) error(404, 'User not found');
	return { entries: await listFollows(profile.id, list, viewerId, Number(raw)) };
}
