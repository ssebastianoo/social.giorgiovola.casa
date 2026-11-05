import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Post, User } from '#lib/types.js';
import { db, likes, posts, users } from './db/index.js';

export type GetPostsOptions = {
	loggedUser?: User | null;
	reply_to?: number | null;
	postId?: number | null;
	fromUser?: (Partial<User> & (Pick<User, 'id'> | Pick<User, 'username'>)) | null;
	excludeReplies?: boolean;
	order?: 'ASC' | 'DESC';
	limit?: number;
	offset?: number;
};

export async function getPosts({
	loggedUser,
	reply_to,
	postId,
	fromUser,
	excludeReplies,
	order,
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
		excludeReplies ? sql`${posts.reply_to} IS NULL` : undefined
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
			reply_to: sql<Post['reply_to']>`(
				SELECT jsonb_build_object('username', u.username, 'id', p.id)
				FROM posts p INNER JOIN users u ON p.user_id = u.id
				WHERE p.id = posts.reply_to
			)`,
			...(loggedUser
				? { liked: sql<boolean>`COALESCE(BOOL_OR(${likes.user_id} = ${loggedUser.id}), false)` }
				: {})
		})
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.leftJoin(likes, eq(posts.id, likes.post_id))
		.where(and(...filters))
		.groupBy(posts.id, users.id)
		.$dynamic();

	if (order === 'ASC') query.orderBy(asc(posts.created_at));
	else if (order === 'DESC') query.orderBy(desc(posts.created_at));
	if (limit != null) query.limit(limit);
	if (offset != null) query.offset(offset);

	return (await query) as unknown as Post[];
}
