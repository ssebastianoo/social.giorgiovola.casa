import { openStream } from '#lib/server/realtime.js';
import type { RequestHandler } from './$types';

/** Server-sent events: new posts, deletions, like/reply counts and the user's unread count. */
export const GET: RequestHandler = ({ locals, request }) => {
	return new Response(openStream(locals.user?.id ?? null, request.signal), {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no'
		}
	});
};
