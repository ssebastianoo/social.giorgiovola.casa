import type { RequestHandler } from './$types';
import { botHandler, botPosts, listParams, mentionsOf } from '#lib/server/bots.js';

/** Posts mentioning the bot or replying to its posts, oldest first (see botPosts). */
export const GET: RequestHandler = botHandler(async (bot, { url }) => {
	const params = listParams(url);
	if (params instanceof Response) return params;
	return Response.json(await botPosts(bot.user, mentionsOf(bot.user), params));
});
