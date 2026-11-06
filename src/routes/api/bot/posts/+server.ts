import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited, readBody } from '#lib/server/bots.js';
import { checkPostRefs, createPost } from '#lib/server/posts.js';
import { LIMITS, parseId } from '#lib/server/validation.js';

const MAX_POSTS = 20;

/**
 * Posts, replies when `reply_to` is set, or quote regiorgs when `quote_of` is set. JSON only:
 * bots can't attach images.
 */
export const POST: RequestHandler = botHandler(async (bot, { request }) => {
	if (bot.muted)
		return botError(
			403,
			`This bot is muted and can't post.${bot.muteReason ? ` Reason: ${bot.muteReason}` : ''}`
		);
	const body = await readBody(request);
	if (!body) return botError(400, 'Invalid JSON');

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) return botError(400, 'Missing content');
	if (content.length > LIMITS.postContent)
		return botError(400, `Posts can be at most ${LIMITS.postContent} characters`);

	const reply_to = body.reply_to != null ? parseId(body.reply_to) : null;
	if (body.reply_to != null && reply_to === null) return botError(400, 'Invalid reply_to');
	const quote_of = body.quote_of != null ? parseId(body.quote_of) : null;
	if (body.quote_of != null && quote_of === null) return botError(400, 'Invalid quote_of');
	const refError = await checkPostRefs(reply_to, quote_of);
	if (refError) return botError(refError.status, refError.message);

	if (botLimited(bot.user.id, 'posts', MAX_POSTS)) return botError(429, 'Posting too fast');
	const post = await createPost(bot.user, { content, reply_to, quote_of });
	return Response.json(post, { status: 201 });
});
