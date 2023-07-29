import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import type { Post } from '$lib/types';

export const load = (async ({ locals, depends }) => {
	let res;

	depends('app:posts');

	if (!locals.user) {
		// anon query
		res = await sql`
            SELECT
                posts.id,
                posts.content,
                posts.created_at,
                posts.edited_at,
                users.username,
                users.name,
                users.avatar,
                users.created_at AS user_created_at,
                COUNT(likes.post_id) AS likes,
            (SELECT COUNT(*) FROM posts AS p WHERE p.reply_to = posts.id) AS replies_count
            FROM posts
            INNER JOIN users ON posts.user_id = users.id
            LEFT JOIN likes ON posts.id = likes.post_id
            WHERE posts.reply_to IS NULL
            GROUP BY posts.id, users.name, users.username, users.avatar, users.created_at
            ORDER BY posts.created_at DESC
        `;
	} else {
		res = await sql`
        SELECT
            posts.id,
            posts.content,
            posts.created_at,
            posts.edited_at,
            users.username,
            users.name,
            users.avatar,
            users.created_at AS user_created_at,
            COUNT(likes.user_id) as likes,
            BOOL(MAX(case when likes.user_id = ${locals.user.id} then 1 else 0 end)) as liked,
            (SELECT COUNT(*) FROM posts AS p WHERE p.reply_to = posts.id) AS replies_count
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.reply_to IS NULL
        GROUP BY posts.id, posts.id, posts.content, posts.created_at, posts.edited_at, users.username, users.name, users.avatar, users.created_at
        ORDER BY posts.created_at DESC
    `;
	}

	const posts: Post[] = res.map((post) => {
		return {
			id: post.id,
			content: post.content,
			created_at: post.created_at,
			edited_at: post.edited_at,
			likes: post.likes,
			liked: post.liked,
			replies_count: post.replies_count,
			user: {
				username: post.username as string,
				name: post.name as string,
				avatar: post.avatar as string,
				created_at: post.user_created_at as Date
			}
		};
	});

	return {
		posts
	};
}) satisfies PageServerLoad;
