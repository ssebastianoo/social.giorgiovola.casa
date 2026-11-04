import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';

export const load = (async ({ cookies }) => {
	const cookie = cookies.get('social.giorgiovola.casa-token');

	if (!cookie) {
		redirect(307, '/login');
	}

	const sessions = await sql`
		SELECT user_id FROM sessions WHERE token = ${cookie}
	`;
	if (sessions.length === 0) {
		redirect(307, '/login');
	}
	const users = await sql`
		SELECT username FROM users WHERE id = ${sessions[0].user_id}
	`;
	if (users.length === 0) {
		redirect(307, '/login');
	}
	redirect(307, `/@${users[0].username}`);
}) satisfies PageServerLoad;
