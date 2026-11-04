import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, users as usersTable } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import type { User } from '#lib/types.js';
import { getPosts } from '#lib/server/posts.js';
import { PAGE_SIZE, pageOffset } from '#lib/server/paging.js';

export const load = (async ({ params, locals, depends }) => {
	const username = params.username.toLowerCase();
	depends('app:posts');

	const users = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			username: usersTable.username,
			avatar: usersTable.avatar,
			created_at: usersTable.created_at,
			email: usersTable.email,
			owner_id: usersTable.owner_id
		})
		.from(usersTable)
		.where(eq(usersTable.username, username));

	if (users.length === 0) {
		error(404, 'User not found');
	}

	let user: User;

	if (locals.user?.username !== username) {
		user = {
			id: 0,
			email: '',
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at,
			// who owns an identity is private
			owner_id: null
		};
	} else {
		user = {
			id: users[0].id,
			name: users[0].name,
			username: users[0].username,
			avatar: users[0].avatar,
			created_at: users[0].created_at,
			email: users[0].email,
			owner_id: users[0].owner_id
		};
	}

	const posts = await getPosts({
		loggedUser: locals.user,
		fromUser: user,
		order: 'DESC',
		limit: PAGE_SIZE
	});
	return {
		user,
		posts,
		self: locals.user && locals.user.username === user.username
	};
}) satisfies PageServerLoad;

export const actions = {
	// infinite scroll of the profile's posts
	async default({ params, locals, request }) {
		const posts = await getPosts({
			loggedUser: locals.user,
			fromUser: { username: params.username.toLowerCase() },
			order: 'DESC',
			limit: PAGE_SIZE,
			offset: await pageOffset(request)
		});
		return { posts };
	}
} satisfies Actions;
