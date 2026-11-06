import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, posts } from '#lib/server/db/index.js';
import { botError, botHandler, botLimited, readBody } from '#lib/server/bots.js';
import { createPost } from '#lib/server/posts.js';
import { LIMITS, parseId } from '#lib/server/validation.js';

const MAX_POSTS = 20;

/** Posts, or replies when `reply_to` is set. JSON only: bots can't attach images. */
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

	let reply_to: number | null = null;
	if (body.reply_to != null) {
		reply_to = parseId(body.reply_to);
		if (reply_to === null) return botError(400, 'Invalid reply_to');
		const parent = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, reply_to));
		if (parent.length === 0) return botError(404, 'Post not found');
	}

	if (botLimited(bot.user.id, 'posts', MAX_POSTS)) return botError(429, 'Posting too fast');
	const post = await createPost(bot.user, { content, reply_to });
	return Response.json(post, { status: 201 });
});
