import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Post, User } from '#lib/types.js';
import { extractHashtags } from '#lib/hashtags.js';
import { getAvatar } from '#lib/utils.js';
import { DISCORD_WEBHOOK_URL } from '$app/env/private';
import { PUBLIC_URL } from '$app/env/public';
import { db, follows, likes, post_hashtags, posts, regiorgs, users } from './db/index.js';
import { imagesOfPostTrees, removeUploads } from './images.js';
import { publishDeleted, publishLikes, publishPost, publishRegiorg } from './realtime.js';

export type GetPostsOptions = {
	loggedUser?: User | null;
	reply_to?: number | null;
	postId?: number | null;
	fromUser?: (Partial<User> & (Pick<User, 'id'> | Pick<User, 'username'>)) | null;
	excludeReplies?: boolean;
	/** only posts by profiles this user follows, and their own */
	followedBy?: number | null;
	/** only posts with this (normalized) hashtag, replies included */
	hashtag?: string | null;
	/** only posts with a greater id */
	afterId?: number | null;
	/** any other filter */
	where?: SQL;
	order?: 'ASC' | 'DESC';
	/** replies that ratio their parent come first (then `order`) */
	ratioFirst?: boolean;
	limit?: number;
	offset?: number;
};

export async function getPosts({
	loggedUser,
	reply_to,
	postId,
	fromUser,
	excludeReplies,
	followedBy,
	hashtag,
	afterId,
	where,
	order,
	ratioFirst,
	limit,
	offset
}: GetPostsOptions) {
	const filters: (SQL | undefined)[] = [
		reply_to != null ? eq(posts.reply_to, reply_to) : undefined,
		postId != null ? eq(posts.id, postId) : undefined,
		fromUser?.id
			? eq(users.id, fromUser.id)
			: fromUser?.username
			? eq(users.username, fromUser.username)
			: undefined,
		excludeReplies ? sql`${posts.reply_to} IS NULL` : undefined,
		followedBy != null
			? sql`(${posts.user_id} = ${followedBy} OR ${posts.user_id} IN (
					SELECT ${follows.followed_id} FROM ${follows} WHERE ${follows.follower_id} = ${followedBy}
				))`
			: undefined,
		hashtag != null
			? sql`${posts.id} IN (
					SELECT ${post_hashtags.post_id} FROM ${post_hashtags} WHERE ${post_hashtags.tag} = ${hashtag}
				)`
			: undefined,
		afterId != null ? sql`${posts.id} > ${afterId}` : undefined,
		where
	];

	const query = db
		.select({
			content: posts.content,
			images: posts.images,
			id: posts.id,
			created_at: posts.created_at,
			edited_at: posts.edited_at,
			user: sql<Post['user']>`jsonb_build_object(
				'id', ${users.id},
				'name', ${users.name},
				'username', ${users.username},
				'avatar', ${users.avatar},
				'created_at', ${users.created_at}
			)`,
			likes: count(likes.post_id),
			// correlated subqueries: the table names are written out so they can't be mis-qualified
			replies_count: sql<number>`(SELECT COUNT(*)::int FROM posts AS p WHERE p.reply_to = posts.id)`,
			regiorgs: sql<number>`(SELECT COUNT(*)::int FROM regiorgs r WHERE r.post_id = posts.id)`,
			reply_to: sql<Post['reply_to']>`(
				SELECT jsonb_build_object(
					'username', u.username,
					'id', p.id,
					'likes', (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id)
				)
				FROM posts p INNER JOIN users u ON p.user_id = u.id
				WHERE p.id = posts.reply_to
			)`,
			...(loggedUser
				? {
						liked: sql<boolean>`COALESCE(BOOL_OR(${likes.user_id} = ${loggedUser.id}), false)`,
						regiorged: sql<boolean>`EXISTS (
							SELECT 1 FROM regiorgs r WHERE r.post_id = posts.id AND r.user_id = ${loggedUser.id}
						)`
				  }
				: {})
		})
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.leftJoin(likes, eq(posts.id, likes.post_id))
		.where(and(...filters))
		.groupBy(posts.id, users.id)
		.$dynamic();

	const ordering: SQL[] = [];
	if (ratioFirst)
		ordering.push(
			desc(
				sql`COUNT(${likes.post_id}) > (SELECT COUNT(*) FROM likes l WHERE l.post_id = posts.reply_to)
					AND posts.user_id IS DISTINCT FROM (SELECT p.user_id FROM posts p WHERE p.id = posts.reply_to)`
			)
		);
	if (order === 'ASC') ordering.push(asc(posts.created_at));
	else if (order === 'DESC') ordering.push(desc(posts.created_at));
	if (ordering.length) query.orderBy(...ordering);
	if (limit != null) query.limit(limit);
	if (offset != null) query.offset(offset);

	return (await query) as unknown as Post[];
}

export type TimelineOptions = {
	loggedUser?: User | null;
	/** whose posts and regiorgs: a condition on a user id column */
	authors: (userId: SQL) => SQL;
	/** leave out their replies (regiorged replies still show) */
	excludeReplies?: boolean;
	limit: number;
	offset?: number;
};

/**
 * The posts of some profiles mixed with the posts they regiorged, newest first. A post shows
 * once, at its latest regiorg or when it was posted, whichever is newer, and carries who
 * regiorged it (`regiorged_by`) when that regiorg is why it is there.
 */
export async function getTimeline({
	loggedUser,
	authors,
	excludeReplies,
	limit,
	offset = 0
}: TimelineOptions) {
	const entries = (await db.execute(sql`
		SELECT t.post_id, u.username, u.name
		FROM (
			SELECT DISTINCT ON (e.post_id) e.post_id, e.regiorger_id, e.at
			FROM (
				SELECT p.id AS post_id, NULL::int AS regiorger_id, p.created_at AS at
				FROM posts p
				WHERE ${authors(sql`p.user_id`)} ${excludeReplies ? sql`AND p.reply_to IS NULL` : sql``}
				UNION ALL
				SELECT r.post_id, r.user_id, r.created_at
				FROM regiorgs r
				WHERE ${authors(sql`r.user_id`)}
			) e
			ORDER BY e.post_id, e.at DESC
		) t
		LEFT JOIN users u ON u.id = t.regiorger_id
		ORDER BY t.at DESC, t.post_id DESC
		LIMIT ${limit} OFFSET ${offset}
	`)) as unknown as { post_id: number; username: string | null; name: string | null }[];
	if (entries.length === 0) return [];

	const found = await getPosts({
		loggedUser,
		where: inArray(
			posts.id,
			entries.map((e) => e.post_id)
		)
	});
	const byId = new Map(found.map((p) => [p.id, p]));
	return entries.flatMap((e): Post[] => {
		const post = byId.get(e.post_id);
		if (!post) return [];
		const regiorged_by = e.username ? { username: e.username, name: e.name ?? e.username } : null;
		return [{ ...post, regiorged_by }];
	});
}

/** The profiles `userId` follows and itself, as a timeline `authors` condition. */
export const followedAuthors = (userId: number) => (column: SQL) =>
	sql`(${column} = ${userId} OR ${column} IN (
		SELECT ${follows.followed_id} FROM ${follows} WHERE ${follows.follower_id} = ${userId}
	))`;

/** One profile, by username, as a timeline `authors` condition. */
export const profileAuthor = (username: string) => (column: SQL) =>
	sql`${column} = (SELECT u.id FROM users u WHERE u.username = ${username})`;

/**
 * Writes a post (or a reply, when `reply_to` is set) by `user` with its hashtags, then tells
 * everyone about it. The input must already be validated and `reply_to` must exist.
 */
export async function createPost(
	user: Pick<User, 'id' | 'username' | 'name' | 'avatar'>,
	{
		content,
		images = [],
		reply_to
	}: { content: string; images?: string[]; reply_to: number | null }
) {
	// the post and its hashtags together, so a post never shows up without its tags
	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(posts)
			.values({ user_id: user.id, content, images, reply_to })
			.returning({
				content: posts.content,
				images: posts.images,
				created_at: posts.created_at,
				edited_at: posts.edited_at,
				id: posts.id
			});
		const tags = extractHashtags(content);
		if (tags.length)
			await tx.insert(post_hashtags).values(tags.map((tag) => ({ post_id: row.id, tag })));
		return row;
	});

	let parentRef: { id: number; username: string; likes: number } | null = null;
	if (reply_to !== null) {
		const [parent] = await db
			.select({
				id: posts.id,
				username: users.username,
				likes: sql<number>`(SELECT COUNT(*)::int FROM likes l WHERE l.post_id = posts.id)`
			})
			.from(posts)
			.innerJoin(users, eq(posts.user_id, users.id))
			.where(eq(posts.id, reply_to));
		parentRef = parent ?? null;
	}
	const { id, username, name, avatar } = user;
	const post = { ...created, reply_to: parentRef, user: { id, username, name, avatar } };

	void publishPost(post.id);
	if (!reply_to && DISCORD_WEBHOOK_URL) {
		// a broken webhook shouldn't make posting fail
		try {
			await fetch(DISCORD_WEBHOOK_URL + '?wait=false', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: `${PUBLIC_URL}/@${post.user.username}/${post.id}`,
					username: post.user.name,
					avatar_url: getAvatar(post.user, 512, true)
				})
			});
		} catch (e) {
			console.error('Discord webhook failed', e);
		}
	}
	return post;
}

/** Deletes a post with its replies and their images. False when it doesn't exist. */
export async function deletePost(postId: number) {
	// replies go with the post: collect the images of the whole thread first
	const images = await imagesOfPostTrees(sql`id = ${postId}`);
	const deleted = await db
		.delete(posts)
		.where(eq(posts.id, postId))
		.returning({ id: posts.id, reply_to: posts.reply_to });
	if (deleted.length === 0) return false;

	await removeUploads(images);
	publishDeleted(postId, deleted[0].reply_to);
	return true;
}

/** Likes or unlikes a post. Idempotent, unlike the toggle of the like button. */
export async function setLiked(userId: number, postId: number, liked: boolean) {
	const [post] = await db
		.select({ id: posts.id, user_id: posts.user_id })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) return null;
	const total = await db.transaction(async (tx) => {
		if (liked)
			await tx
				.insert(likes)
				.values({ user_id: userId, post_id: postId })
				.onConflictDoNothing({ target: [likes.user_id, likes.post_id] });
		else await tx.delete(likes).where(and(eq(likes.user_id, userId), eq(likes.post_id, postId)));
		return tx.$count(likes, eq(likes.post_id, postId));
	});
	void publishLikes(postId, post.user_id, total);
	return { liked, likes: total };
}

/** Regiorgs or un-regiorgs a post. Idempotent, unlike the toggle of the regiorg button. */
export async function setRegiorged(userId: number, postId: number, regiorged: boolean) {
	const [post] = await db
		.select({ id: posts.id, user_id: posts.user_id })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) return null;
	const { added, total } = await db.transaction(async (tx) => {
		let added = false;
		if (regiorged) {
			const res = await tx
				.insert(regiorgs)
				.values({ user_id: userId, post_id: postId })
				.onConflictDoNothing({ target: [regiorgs.user_id, regiorgs.post_id] })
				.returning({ post_id: regiorgs.post_id });
			added = res.length > 0;
		} else
			await tx
				.delete(regiorgs)
				.where(and(eq(regiorgs.user_id, userId), eq(regiorgs.post_id, postId)));
		return { added, total: await tx.$count(regiorgs, eq(regiorgs.post_id, postId)) };
	});
	void publishRegiorg(postId, post.user_id, total, added ? userId : null);
	return { regiorged, regiorgs: total };
}

/** Whether `userId` has regiorged the post. */
export async function isRegiorged(userId: number, postId: number) {
	const n = await db.$count(
		regiorgs,
		and(eq(regiorgs.user_id, userId), eq(regiorgs.post_id, postId))
	);
	return n > 0;
}
