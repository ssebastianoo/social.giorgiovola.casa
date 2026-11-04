import { json } from '@sveltejs/kit';
import { sql } from '#lib/server/db.js';
import { getVapid, isPushEndpoint } from '#lib/server/push.js';
import type { RequestHandler } from './$types';

const MAX_PER_SESSION = 10;
const KEY = /^[A-Za-z0-9_-]{16,256}$/;

async function readBody(request: Request): Promise<Record<string, any> | null> {
	try {
		const value = await request.json();
		return value && typeof value === 'object' ? value : null;
	} catch {
		return null;
	}
}

/** The public VAPID key the browser subscribes with. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	return json({ publicKey: (await getVapid()).publicKey });
};

/** Stores (or refreshes) this browser's subscription for the active session. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const session = locals.sessions[0];
	if (!locals.user || !session) return new Response(null, { status: 401 });

	const { endpoint, keys } = (await readBody(request)) ?? {};
	if (!isPushEndpoint(endpoint) || !KEY.test(keys?.p256dh ?? '') || !KEY.test(keys?.auth ?? ''))
		return new Response(null, { status: 400 });

	await sql.begin(async (sql) => {
		await sql`
			INSERT INTO push_subscriptions (session_token, endpoint, p256dh, auth)
			VALUES (${session.token}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
			ON CONFLICT (session_token, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
		`;
		await sql`
			DELETE FROM push_subscriptions
			WHERE session_token = ${session.token}
				AND endpoint NOT IN (
					SELECT endpoint FROM push_subscriptions WHERE session_token = ${session.token}
					ORDER BY created_at DESC LIMIT ${MAX_PER_SESSION}
				)
		`;
	});
	return new Response(null, { status: 204 });
};

/** Removes this browser's subscription for the active session. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	const session = locals.sessions[0];
	if (!locals.user || !session) return new Response(null, { status: 401 });

	const endpoint = (await readBody(request))?.endpoint;
	if (typeof endpoint !== 'string') return new Response(null, { status: 400 });
	await sql`
		DELETE FROM push_subscriptions WHERE session_token = ${session.token} AND endpoint = ${endpoint}
	`;
	return new Response(null, { status: 204 });
};
