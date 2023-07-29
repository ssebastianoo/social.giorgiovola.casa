import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PublicUser, Post as PostType } from '$lib/types';

export const load = (async ({ params, locals, depends }) => {
	const username = params.username;
	depends('app:posts');

	const users = await sql`
		SELECT id, name, username, avatar, created_at
		FROM users
		WHERE username = ${username}
	`;

	if (users.length === 0) {
		throw error(404, 'User not found');
	}

	const user: PublicUser = {
		name: users[0].name,
		username: users[0].username,
		avatar: users[0].avatar,
		created_at: users[0].created_at
	};

	let result;

	if (!locals.user) {
		result = await sql`
			SELECT
				posts.content,
				posts.created_at,
				posts.id,
				posts.edited_at,
				COUNT(likes.post_id) AS likes
			FROM posts
			LEFT JOIN likes ON posts.id = likes.post_id
			WHERE posts.user_id = ${users[0].id}
			GROUP BY posts.id
			ORDER BY posts.created_at DESC
        `;
	} else {
		result = await sql`
			SELECT 
				posts.content, 
				posts.id, 
				posts.created_at,
				posts.edited_at,
				COUNT(likes.post_id) AS likes,
				BOOL(MAX(case when likes.user_id = ${locals.user.id} then 1 else 0 end)) as liked
			FROM posts
			LEFT JOIN likes ON posts.id = likes.post_id
			WHERE posts.user_id = ${users[0].id}
			GROUP BY posts.id
			ORDER BY posts.created_at DESC
        `;
	}

	const posts = result.map((post) => {
		post.user = user;
		return post;
	}) as PostType[];

	return {
		user,
		posts
	};
}) satisfies PageServerLoad;
