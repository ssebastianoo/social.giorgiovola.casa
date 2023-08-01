import type { Post, User } from '$lib/types';
import { sql } from './db';

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

// i hate typescript

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
	const posts = await sql<Post[]>`
    SELECT
    posts.content,
    posts.id,
    posts.created_at,
    posts.edited_at,
    jsonb_build_object(
        'id', users.id,
        'name', users.name,
        'username', users.username,
        'avatar', users.avatar,
        'created_at', users.created_at
    ) AS user,
    COUNT(likes.post_id) AS likes,
    (SELECT COUNT(*)::int FROM posts AS p WHERE p.reply_to = posts.id) AS replies_count,
    (SELECT jsonb_build_object(
        'username', u.username,
        'id', p.id
    ) FROM posts p INNER JOIN users u ON p.user_id = u.id WHERE p.id = posts.reply_to
    ) AS reply_to
    ${
			loggedUser
				? sql`, BOOL(MAX(case when likes.user_id = ${loggedUser.id} then 1 else 0 end)) as liked`
				: sql``
		}
    FROM posts
    INNER JOIN users ON posts.user_id = users.id
    LEFT JOIN likes ON posts.id = likes.post_id
    WHERE TRUE
    ${reply_to ? sql`AND posts.reply_to = ${reply_to}` : sql``}
    ${postId ? sql`AND posts.id = ${postId}` : sql``}
    ${
			fromUser
				? fromUser.id
					? sql`AND users.id = ${fromUser.id}`
					: fromUser.username
					? sql`AND users.username=${fromUser.username}`
					: sql``
				: sql``
		} 
    ${excludeReplies ? sql`AND posts.reply_to IS NULL` : sql``}
    GROUP BY posts.id, users.id
    ${sql.unsafe(order ? `ORDER BY posts.created_at ${order}` : '')} 
    ${sql.unsafe(limit ? `LIMIT ${limit}` : '')}
    ${sql.unsafe(offset ? `OFFSET ${offset}` : '')}
    `;
	// ^^ unsafe because postgres doesn't allow paremeters in ORDER BY and friends, anyways order, limit and offset
	// come from the server so it's fine
	return posts as Post[];
}
