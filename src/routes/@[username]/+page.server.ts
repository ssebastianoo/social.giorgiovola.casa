import type { PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PublicUser, User } from '$lib/types';
import { getPosts } from '$lib/server/posts';

export const load = (async ({ params, locals, depends }) => {
	const username = params.username;
	depends('app:posts');

	const users = await sql`
		SELECT id, name, username, avatar, created_at, email
		FROM users
		WHERE username = ${username}
	`;

	if (users.length === 0) {
		throw error(404, 'User not found');
	}

	let user: User;

	if (locals.user?.username !== username) {
		user = {
			id: 0,
			email: '',
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at
		};
	} else {
		user = {
			id: users[0].id,
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at,
			email: users[0].email
		};
	}

	const posts = await getPosts({ loggedUser: locals.user, fromUser: user, order: 'DESC' });
	return {
		user,
		posts,
		self: locals.user && locals.user.username === user.username
	};
}) satisfies PageServerLoad;
