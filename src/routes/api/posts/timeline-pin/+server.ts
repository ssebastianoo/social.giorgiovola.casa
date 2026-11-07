import { setTimelinePinned } from '#lib/server/posts.js';
import { actionsLimited, isStaff } from '#lib/server/moderation.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

/** Staff only: pins a post to the home timeline for everyone (`pinned: true`) or unpins it. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response(null, { status: 401 });
	if (!isStaff(locals.role) || locals.accountId === null)
		return new Response('Only moderators can pin posts to the timeline', { status: 403 });

	let id: number | null = null;
	let pinned: unknown;
	try {
		const body = await request.json();
		id = parseId(body?.id);
		pinned = body?.pinned;
	} catch {
		// invalid JSON, handled below
	}
	if (id === null || typeof pinned !== 'boolean') return new Response(null, { status: 400 });

	if (actionsLimited(locals.accountId)) return new Response('Slow down', { status: 429 });

	const result = await setTimelinePinned(id, pinned);
	if ('status' in result) return new Response(result.message, { status: result.status });
	return Response.json(result);
};
