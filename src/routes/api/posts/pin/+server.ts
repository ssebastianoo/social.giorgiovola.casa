import { getPinnedId, setPinned } from '#lib/server/posts.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

const WINDOW_MS = 60_000;
const MAX_TOGGLES = 30;

/** Pins the viewer's post to their profile, or unpins it when it already is the pinned one. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response(null, { status: 401 });

	let id: number | null = null;
	try {
		id = parseId((await request.json())?.id);
	} catch {
		// invalid JSON, handled below
	}
	if (id === null) return new Response(null, { status: 400 });

	const key = `pin:${locals.user.id}`;
	if (isLimited(key, MAX_TOGGLES)) return new Response('Slow down', { status: 429 });
	hit(key, WINDOW_MS);

	const pinned = (await getPinnedId(locals.user.id)) !== id;
	const result = await setPinned(locals.user.id, id, pinned);
	if (!result) return new Response('You can only pin your own posts, not replies', { status: 404 });
	return Response.json(result);
};
