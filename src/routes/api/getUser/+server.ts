import type { RequestHandler } from './$types';
import { sql } from '$lib/db';
import type { User } from '$lib/types';

export const GET: RequestHandler = async ({ cookies }) => {
	const cookie = cookies.get('social.giorgiovola.casa-token');
	if (!cookie) {
		return new Response(
			JSON.stringify({
				user: null,
				logged: false
			})
		);
	}

	const sessions = await sql`
	SELECT user_id FROM sessions WHERE token = ${cookie}
	`;

	if (sessions.length === 0) {
		return new Response(
			JSON.stringify({
				user: null,
				logged: false
			})
		);
	}

	const res = await sql`
	SELECT * FROM users WHERE id = ${sessions[0].user_id}
	`;

	const user: User = {
		id: res[0].id,
		email: res[0].email,
		name: res[0].name,
		username: res[0].username,
		avatar: res[0].avatar,
		created_at: res[0].created_at
	};

	return new Response(
		JSON.stringify({
			user: user,
			logged: true
		})
	);
};
