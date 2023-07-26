import type { PageServerLoad } from './$types';
import { sql } from '$lib/db';
import type { Post } from '$lib/types';

export const load = (async () => {
	const res = await sql`
		SELECT
			posts.id,
			posts.content,
			posts.created_at,
			posts.edited_at,
			users.username,
			users.name,
			users.avatar,
			users.created_at AS user_created_at
		FROM posts
		INNER JOIN users ON posts.user_id = users.id
		ORDER BY posts.created_at DESC
	`;

	const posts: Post[] = res.map((post) => {
		return {
			id: post.id,
			content: post.content,
			created_at: post.created_at,
			edited_at: post.edited_at,
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
