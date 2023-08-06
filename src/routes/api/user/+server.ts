import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const data = await request.json();

	if (!data.name || !data.username || !data.email) {
		return new Response('Missing fields', { status: 400 });
	}

	const username = data.username.toLowerCase().replaceAll(' ', '');
	data.username.toLowerCase().replaceAll(' ', '');

	const check = await sql`
		SELECT username FROM users
		WHERE username = ${username}
		OR email = ${data.email}
	`;
	if (
		check.length > 0 &&
		check[0].username !== locals.user.username &&
		check[0].email !== locals.user.email
	) {
		return new Response('Username already in use.', { status: 400 });
	}

	const users = await sql`
		UPDATE users 
		SET
			name = ${data.name},
			username = ${data.username.toLowerCase().replaceAll(' ', '')},
			email = ${data.email} 
		WHERE id = ${locals.user.id}
		RETURNING id, name, username, email, avatar, created_at
	`;

	return new Response(JSON.stringify(users[0]));
};
