import type { Handle } from '@sveltejs/kit/hooks';
import { and, eq, exists, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, identity_members, sessions, users } from '#lib/server/db/index.js';
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
		// the identity the session is acting as, if the account owns it or it is shared with it
		const profile = alias(users, 'profile');
		const owner = alias(users, 'owner');
		const rows = await db
			.select({
				token: sessions.token,
				account: {
					id: account.id,
					email: account.email,
					name: account.name,
					username: account.username,
					avatar: account.avatar,
					created_at: account.created_at,
					role: account.role,
					muted_at: account.muted_at,
					mute_reason: account.mute_reason
				},
				profile: {
					id: profile.id,
					email: profile.email,
					name: profile.name,
					username: profile.username,
					avatar: profile.avatar,
					created_at: profile.created_at,
					owner_id: profile.owner_id
				},
				owner_banned_at: owner.banned_at,
				owner_muted_at: owner.muted_at,
				owner_mute_reason: owner.mute_reason
			})
			.from(sessions)
			.innerJoin(account, eq(account.id, sessions.user_id))
			.leftJoin(
				profile,
				and(
					eq(profile.id, sessions.acting_id),
					or(
						eq(profile.owner_id, sessions.user_id),
						exists(
							db
								.select({ one: sql`1` })
								.from(identity_members)
								.where(
									and(
										eq(identity_members.identity_id, profile.id),
										eq(identity_members.account_id, sessions.user_id)
									)
								)
						)
					)
				)
			)
			.leftJoin(owner, eq(owner.id, profile.owner_id))
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

		event.locals.sessions = valid.map((r) => ({ token: r.token, accountId: r.account.id }));
		if (valid.length > 0) {
			const { account: a, profile: p, ...o } = valid[0];
			// an identity that is no longer shared with the account, or whose owner was banned,
			// falls back to the account itself
			const acting = p && !o.owner_banned_at ? p : null;
			// a shared identity is muted when its owner is, so sharing it can't dodge a mute
			const mute = a.muted_at
				? a.mute_reason
				: acting && o.owner_muted_at
				? o.owner_mute_reason
				: undefined;
			event.locals.accountId = a.id;
			event.locals.role = a.role;
			event.locals.muted = mute !== undefined;
			event.locals.muteReason = mute ?? null;
			event.locals.user = acting ?? {
				id: a.id,
				email: a.email,
				name: a.name,
				username: a.username,
				avatar: a.avatar,
				created_at: a.created_at,
				owner_id: null
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
