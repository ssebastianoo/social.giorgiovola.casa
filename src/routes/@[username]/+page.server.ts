import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PublicUser, Post as PostType } from '$lib/types';
import { getPosts } from '$lib/server/posts';

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

	const posts = await getPosts({ loggedUser: locals.user, fromUser: user });
	return {
		user,
		posts
	};
}) satisfies PageServerLoad;
