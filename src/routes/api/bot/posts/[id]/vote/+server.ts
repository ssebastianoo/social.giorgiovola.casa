import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited, readBody } from '#lib/server/bots.js';
import { vote } from '#lib/server/polls.js';
import { parseId } from '#lib/server/validation.js';

const MAX_VOTES = 30;

/** Votes in the poll of a post: { "option": index }. Changeable until the poll ends. */
export const PUT: RequestHandler = botHandler(async (bot, { params, request }) => {
	const postId = parseId(params.id);
	if (postId === null) return botError(400, 'Invalid post id');
	const body = await readBody(request);
	if (!body) return botError(400, 'Invalid JSON');
	if (typeof body.option !== 'number') return botError(400, 'Invalid option');
	if (botLimited(bot.user.id, 'votes', MAX_VOTES)) return botError(429, 'Voting too fast');
	const result = await vote(bot.user.id, postId, body.option);
	if (!result.ok) return botError(result.status, result.message);
	return Response.json({ voted: result.voted, votes: result.votes });
});
