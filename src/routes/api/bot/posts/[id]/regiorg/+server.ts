import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited } from '#lib/server/bots.js';
import { setRegiorged } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const MAX_REGIORGS = 30;

const regiorg = (regiorged: boolean): RequestHandler =>
	botHandler(async (bot, { params }) => {
		const postId = parseId(params.id);
		if (postId === null) return botError(400, 'Invalid post id');
		// a regiorg shows up in followers' feeds like a post; undoing one is always allowed
		if (regiorged && bot.muted)
			return botError(
				403,
				`This bot is muted and can't regiorg.${bot.muteReason ? ` Reason: ${bot.muteReason}` : ''}`
			);
		if (botLimited(bot.user.id, 'regiorgs', MAX_REGIORGS))
			return botError(429, 'Regiorging too fast');
		const result = await setRegiorged(bot.user.id, postId, regiorged);
		if (!result) return botError(404, 'Post not found');
		return Response.json(result);
	});

/** Regiorgs the post (does nothing when it is already regiorged). */
export const PUT = regiorg(true);
/** Removes the regiorg. */
export const DELETE = regiorg(false);
