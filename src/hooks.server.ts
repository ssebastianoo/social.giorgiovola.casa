import type { Handle } from '@sveltejs/kit/hooks';
import { sql } from '#lib/server/db.js';
import { SESSION_DAYS, cookieTokens, setSessionCookies } from '#lib/server/session.js';
import { PUBLIC_URL } from '$app/env/public';

const securityHeaders: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export const handle = (async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.accountId = null;
	event.locals.sessions = [];

	const tokens = cookieTokens(event.cookies);
	if (tokens.length > 0) {
		// one row per valid session, with the profile it is currently acting as
		const rows = await sql`
			SELECT sessions.token, sessions.user_id AS account_id,
				users.id, users.email, users.name, users.username, users.avatar, users.created_at, users.owner_id
			FROM sessions
			INNER JOIN users ON users.id = COALESCE(sessions.acting_id, sessions.user_id)
				AND (users.id = sessions.user_id OR users.owner_id = sessions.user_id)
			WHERE sessions.token IN ${sql(tokens)}
			AND sessions.created_at > NOW() - make_interval(days => ${SESSION_DAYS})
		`;
		const valid = tokens
			.map((token) => rows.find((r) => r.token === token))
			.filter((r): r is (typeof rows)[number] => !!r);

		// the active session expired (or a token went stale): fall back to the next signed in account
		if (valid.length !== tokens.length)
			setSessionCookies(
				event.cookies,
				valid.map((r) => r.token)
			);

		event.locals.sessions = valid.map((r) => ({ token: r.token, accountId: r.account_id }));
		if (valid.length > 0) {
			const u = valid[0];
			event.locals.accountId = u.account_id;
			event.locals.user = {
				id: u.id,
				email: u.email,
				name: u.name,
				username: u.username,
				avatar: u.avatar,
				created_at: u.created_at,
				owner_id: u.owner_id
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
