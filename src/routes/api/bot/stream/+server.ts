import type { RequestHandler } from './$types';
import { botHandler } from '#lib/server/bots.js';
import { openBotStream } from '#lib/server/realtime.js';

/**
 * Server-sent events for bots: `mention` for posts mentioning the bot or replying to it, `post`
 * for posts by profiles it follows. A post can be both. Missed events can be caught up with
 * /api/bot/mentions and /api/bot/feed.
 */
export const GET: RequestHandler = botHandler(({ user }, { request }) => {
	return new Response(openBotStream(user, request.signal), {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no'
		}
	});
});
