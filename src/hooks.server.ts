import type { Handle } from '@sveltejs/kit/hooks';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, sessions, users } from '#lib/server/db/index.js';
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
	event.locals.role = 'user';
	event.locals.muted = false;
	event.locals.muteReason = null;

	const tokens = cookieTokens(event.cookies);
	if (tokens.length > 0) {
		// role, ban and mute belong to the account, whichever of its profiles is in use
		const account = alias(users, 'account');
		// one row per valid session, with the profile it is currently acting as
		const rows = await db
			.select({
				token: sessions.token,
				account_id: sessions.user_id,
				id: users.id,
				email: users.email,
				name: users.name,
				username: users.username,
				avatar: users.avatar,
				created_at: users.created_at,
				owner_id: users.owner_id,
				role: account.role,
				muted_at: account.muted_at,
				mute_reason: account.mute_reason
			})
			.from(sessions)
			.innerJoin(
				users,
				and(
					eq(users.id, sql`COALESCE(${sessions.acting_id}, ${sessions.user_id})`),
					or(eq(users.id, sessions.user_id), eq(users.owner_id, sessions.user_id))
				)
			)
			.innerJoin(account, eq(account.id, sessions.user_id))
			.where(
				and(
					inArray(sessions.token, tokens),
					// banned accounts are signed out when banned, this covers any session left behind
					isNull(account.banned_at),
					gt(sessions.created_at, sql`NOW() - make_interval(days => ${SESSION_DAYS})`)
				)
			);
		const valid = tokens
			.map((token) => rows.find((r) => r.token === token))
			.filter((r): r is (typeof rows)[number] => !!r);

		// the active session expired (or a token went stale): fall back to the next signed in account
		if (valid.length !== tokens.length)
			setSessionCookies(
				event.cookies,
				valid.map((r) => r.token)
			);

		event.locals.sessions = valid.map((r) => ({ token: r.token, accountId: r.account_id ?? r.id }));
		if (valid.length > 0) {
			const u = valid[0];
			event.locals.accountId = u.account_id;
			event.locals.role = u.role;
			event.locals.muted = u.muted_at !== null;
			event.locals.muteReason = u.mute_reason;
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
