import type { Cookies } from '@sveltejs/kit';
import { sql } from './db';

export const SESSION_COOKIE = 'social.giorgiovola.casa-token';
export const SESSION_DAYS = 30;

const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' } as const;

export async function createSession(cookies: Cookies, userId: number) {
	// opportunistic cleanup so expired sessions don't pile up
	await sql`DELETE FROM sessions WHERE created_at < NOW() - make_interval(days => ${SESSION_DAYS})`;
	const sessions = await sql`
		INSERT INTO sessions (user_id) VALUES (${userId})
		RETURNING token
	`;
	cookies.set(SESSION_COOKIE, sessions[0].token, {
		...cookieOptions,
		maxAge: 60 * 60 * 24 * SESSION_DAYS
	});
}

export async function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await sql`DELETE FROM sessions WHERE token = ${token}`;
	cookies.delete(SESSION_COOKIE, cookieOptions);
}
