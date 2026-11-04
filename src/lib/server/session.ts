import type { Cookies } from '@sveltejs/kit';
import { eq, inArray, lt, sql } from 'drizzle-orm';
import { db, sessions } from './db/index.js';

/** Token of the session currently in use. */
export const SESSION_COOKIE = 'social.giorgiovola.casa-token';
/** Tokens of every account signed in on this browser, active one included, most recent first. */
export const ACCOUNTS_COOKIE = 'social.giorgiovola.casa-accounts';
export const SESSION_DAYS = 30;
/** How many different accounts can be signed in at once on one browser. */
export const MAX_SESSIONS = 5;

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' } as const;

export type SessionRef = { token: string; accountId: number };

/** Every well formed token the browser holds, active first. Not checked against the database. */
export function cookieTokens(cookies: Cookies): string[] {
	const active = cookies.get(SESSION_COOKIE);
	const list = (cookies.get(ACCOUNTS_COOKIE) ?? '').split('.');
	const tokens = [...(active ? [active] : []), ...list].filter((t) => TOKEN_RE.test(t));
	return [...new Set(tokens)].slice(0, MAX_SESSIONS + 1);
}

/** Writes the cookies; `tokens[0]` becomes the active session. Clears them when empty. */
export function setSessionCookies(cookies: Cookies, tokens: string[]) {
	if (tokens.length === 0) {
		cookies.delete(SESSION_COOKIE, cookieOptions);
		cookies.delete(ACCOUNTS_COOKIE, cookieOptions);
		return;
	}
	const opts = { ...cookieOptions, maxAge: 60 * 60 * 24 * SESSION_DAYS };
	cookies.set(SESSION_COOKIE, tokens[0], opts);
	cookies.set(ACCOUNTS_COOKIE, tokens.join('.'), opts);
}

/** Signs `userId` in on top of the accounts already signed in, and makes it the active one. */
export async function createSession(cookies: Cookies, userId: number, signedIn: SessionRef[] = []) {
	// opportunistic cleanup so expired sessions don't pile up
	await db
		.delete(sessions)
		.where(lt(sessions.created_at, sql`NOW() - make_interval(days => ${SESSION_DAYS})`));
	const [created] = await db.insert(sessions).values({ user_id: userId }).returning({
		token: sessions.token
	});

	// signing in to an account that is already signed in replaces its old session,
	// and the oldest account is signed out once there are too many
	const others = signedIn.filter((s) => s.accountId !== userId);
	const dropped = [
		...signedIn.filter((s) => s.accountId === userId),
		...others.slice(MAX_SESSIONS - 1)
	].map((s) => s.token);
	if (dropped.length > 0) await db.delete(sessions).where(inArray(sessions.token, dropped));

	setSessionCookies(cookies, [
		created.token,
		...others.slice(0, MAX_SESSIONS - 1).map((s) => s.token)
	]);
}

/** Signs out the active account; the next signed in account (if any) becomes active. */
export async function destroySession(cookies: Cookies, signedIn: SessionRef[]) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(sessions).where(eq(sessions.token, token));
	setSessionCookies(
		cookies,
		signedIn.map((s) => s.token).filter((t) => t !== token)
	);
}

/** Signs out every account on this browser. */
export async function destroyAllSessions(cookies: Cookies) {
	const tokens = cookieTokens(cookies);
	if (tokens.length > 0) await db.delete(sessions).where(inArray(sessions.token, tokens));
	setSessionCookies(cookies, []);
}
