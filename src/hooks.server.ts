import { sql } from '$lib/server/db';
import type { Handle } from '@sveltejs/kit';

export const handle = (async ({ event, resolve }) => {
	const cookie = event.cookies.get('social.giorgiovola.casa-token');
	if (!cookie) {
		event.locals.user = null;
		return await resolve(event);
	}

	const sessions = await sql`
		SELECT user_id FROM sessions WHERE token = ${cookie}
	`;

	if (sessions.length === 0) {
		event.locals.user = null;
		return await resolve(event);
	}

	const res = await sql`
		SELECT * FROM users WHERE id = ${sessions[0].user_id}
	`;

	const user = {
		id: res[0].id,
		email: res[0].email,
		name: res[0].name,
		username: res[0].username,
		avatar: res[0].avatar,
		created_at: res[0].created_at
	};

	event.locals.user = user;
	return await resolve(event);
}) satisfies Handle;
