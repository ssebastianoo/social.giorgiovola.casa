import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PublicUser, Post } from '$lib/types';

export const load = (async ({ params }) => {
	const username = params.username;
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

	let posts: Post[] = await sql`
		SELECT content, created_at, edited_at, id
		FROM posts
		WHERE user_id = ${users[0].id}
        ORDER BY posts.created_at DESC
	`;

	posts = posts.map((post) => {
		post.user = user;
		return post;
	});

	return {
		user,
		posts
	};
}) satisfies PageServerLoad;
