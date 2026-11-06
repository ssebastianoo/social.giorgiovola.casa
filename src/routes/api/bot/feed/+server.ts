import type { RequestHandler } from './$types';
import { botHandler, botPosts, followedBy, listParams } from '#lib/server/bots.js';

/** Posts and replies by the profiles the bot follows, oldest first (see botPosts). */
export const GET: RequestHandler = botHandler(async (bot, { url }) => {
	const params = listParams(url);
	if (params instanceof Response) return params;
	return Response.json(await botPosts(bot.user, followedBy(bot.user), params));
});
