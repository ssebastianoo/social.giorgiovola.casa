import { json } from '@sveltejs/kit';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { db, push_subscriptions } from '#lib/server/db/index.js';
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

	await db.transaction(async (tx) => {
		await tx
			.insert(push_subscriptions)
			.values({ session_token: session.token, endpoint, p256dh: keys.p256dh, auth: keys.auth })
			.onConflictDoUpdate({
				target: [push_subscriptions.session_token, push_subscriptions.endpoint],
				set: { p256dh: keys.p256dh, auth: keys.auth }
			});
		const keep = tx
			.select({ endpoint: push_subscriptions.endpoint })
			.from(push_subscriptions)
			.where(eq(push_subscriptions.session_token, session.token))
			.orderBy(desc(push_subscriptions.created_at))
			.limit(MAX_PER_SESSION);
		await tx
			.delete(push_subscriptions)
			.where(
				and(
					eq(push_subscriptions.session_token, session.token),
					notInArray(push_subscriptions.endpoint, keep)
				)
			);
	});
	return new Response(null, { status: 204 });
};

/** Removes this browser's subscription for the active session. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	const session = locals.sessions[0];
	if (!locals.user || !session) return new Response(null, { status: 401 });

	const endpoint = (await readBody(request))?.endpoint;
	if (typeof endpoint !== 'string') return new Response(null, { status: 400 });
	await db
		.delete(push_subscriptions)
		.where(
			and(eq(push_subscriptions.session_token, session.token), eq(push_subscriptions.endpoint, endpoint))
		);
	return new Response(null, { status: 204 });
};
