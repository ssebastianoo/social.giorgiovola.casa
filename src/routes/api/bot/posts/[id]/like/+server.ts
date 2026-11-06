import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited } from '#lib/server/bots.js';
import { setLiked } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const MAX_LIKES = 60;

const like = (liked: boolean): RequestHandler =>
	botHandler(async (bot, { params }) => {
		const postId = parseId(params.id);
		if (postId === null) return botError(400, 'Invalid post id');
		if (botLimited(bot.user.id, 'likes', MAX_LIKES)) return botError(429, 'Liking too fast');
		const result = await setLiked(bot.user.id, postId, liked);
		if (!result) return botError(404, 'Post not found');
		return Response.json(result);
	});

/** Likes the post (does nothing when it is already liked). */
export const PUT = like(true);
/** Removes the like. */
export const DELETE = like(false);
