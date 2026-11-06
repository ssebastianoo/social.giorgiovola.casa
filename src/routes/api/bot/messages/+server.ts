import type { RequestHandler } from './$types';
import { botHandler, listParams } from '#lib/server/bots.js';
import { getReceived } from '#lib/server/messages.js';

/** Direct messages the bot received from anyone, oldest first (the stream's `message` events). */
export const GET: RequestHandler = botHandler(async ({ user }, { url }) => {
	const params = listParams(url);
	if (params instanceof Response) return params;
	return Response.json(await getReceived(user, params));
});
