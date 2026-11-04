import type { Handle } from '@sveltejs/kit/hooks';
import { sql } from '#lib/server/db.js';
import { SESSION_COOKIE, SESSION_DAYS } from '#lib/server/session.js';
import { PUBLIC_URL } from '$app/env/public';

const securityHeaders: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export const handle = (async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const res = await sql`
			SELECT users.id, users.email, users.name, users.username, users.avatar, users.created_at
			FROM sessions
			INNER JOIN users ON users.id = sessions.user_id
			WHERE sessions.token = ${token}
			AND sessions.created_at > NOW() - make_interval(days => ${SESSION_DAYS})
		`;
		if (res.length > 0) {
			const u = res[0];
			event.locals.user = {
				id: u.id,
				email: u.email,
				name: u.name,
				username: u.username,
				avatar: u.avatar,
				created_at: u.created_at
			};
		}
	}

	const response = await resolve(event);
	try {
		for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);

		if (PUBLIC_URL?.startsWith('https://'))
			response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	} catch {
		// some responses (e.g. Response.redirect) have immutable headers
	}
	return response;
}) satisfies Handle;
