import { and, desc, eq, sql } from 'drizzle-orm';
import { db, follows, users } from './db/index.js';
import type { ProfileCard } from '#lib/types.js';

export async function setFollowing(followerId: number, followedId: number, following: boolean) {
	if (following) {
		await db
			.insert(follows)
			.values({ follower_id: followerId, followed_id: followedId })
			.onConflictDoNothing();
	} else {
		await db
			.delete(follows)
			.where(and(eq(follows.follower_id, followerId), eq(follows.followed_id, followedId)));
	}
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
			bio: users.bio
		})
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	if (!profile) return null;

	const self = viewerId === profile.id;
	const others = viewerId && !self;
	const [stats, followsYou, mutuals] = await Promise.all([
		getFollowStats(profile.id, viewerId),
		others
			? db.$count(
					follows,
					and(eq(follows.follower_id, profile.id), eq(follows.followed_id, viewerId))
			  )
			: 0,
		// profiles the viewer follows that follow this one
		others
			? db
					.select({
						username: users.username,
						name: users.name,
						avatar: users.avatar,
						total: sql<number>`(COUNT(*) OVER ())::int`
					})
					.from(follows)
					.innerJoin(users, eq(users.id, follows.follower_id))
					.where(
						and(
							eq(follows.followed_id, profile.id),
							sql`${follows.follower_id} IN (
								SELECT f.followed_id FROM follows f WHERE f.follower_id = ${viewerId}
							)`
						)
					)
					.orderBy(desc(follows.created_at))
					.limit(MUTUALS_SHOWN)
			: []
	]);

	return {
		username: profile.username,
		name: profile.name,
		avatar: profile.avatar,
		bio: profile.bio,
		...stats,
		self,
		followsYou: followsYou > 0,
		followedBy: {
			users: mutuals.map(({ username, name, avatar }) => ({ username, name, avatar })),
			total: mutuals[0]?.total ?? 0
		}
	};
}
