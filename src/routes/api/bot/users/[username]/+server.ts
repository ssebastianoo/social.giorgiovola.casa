import type { RequestHandler } from './$types';
import { botError, botHandler } from '#lib/server/bots.js';
import { getProfileCard } from '#lib/server/follows.js';

/** A profile, with its follow counts and whether the bot follows it. */
export const GET: RequestHandler = botHandler(async (bot, { params }) => {
	const card = await getProfileCard(params.username, bot.user.id);
	if (!card) return botError(404, 'User not found');
	return Response.json(card);
});
