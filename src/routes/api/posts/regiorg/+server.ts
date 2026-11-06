import { isRegiorged, setRegiorged } from '#lib/server/posts.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { parseId } from '#lib/server/validation.js';
import type { RequestHandler } from './$types';

const WINDOW_MS = 60_000;
const MAX_TOGGLES = 30;

/** Toggles the viewer's regiorg of a post. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response(null, { status: 401 });

	let id: number | null = null;
	try {
		id = parseId((await request.json())?.id);
	} catch {
		// invalid JSON, handled below
	}
	if (id === null) return new Response(null, { status: 400 });

	const key = `regiorg:${locals.user.id}`;
	if (isLimited(key, MAX_TOGGLES)) return new Response('Slow down', { status: 429 });
	const regiorged = !(await isRegiorged(locals.user.id, id));
	// a regiorg puts the post in followers' feeds, like posting does: muted profiles can only undo
	if (regiorged && locals.muted) return new Response(mutedMessage(locals), { status: 403 });
	hit(key, WINDOW_MS);

	const result = await setRegiorged(locals.user.id, id, regiorged);
	if (!result) return new Response(null, { status: 404 });
	// the absolute count, like for likes: the realtime `counts` event may arrive first
	return Response.json(result);
};
