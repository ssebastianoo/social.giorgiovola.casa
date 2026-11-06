import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, posts } from '#lib/server/db/index.js';
import { botError, botHandler } from '#lib/server/bots.js';
import { deletePost, getPosts } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

/** A single post. */
export const GET: RequestHandler = botHandler(async (bot, { params }) => {
	const postId = parseId(params.id);
	if (postId === null) return botError(400, 'Invalid post id');
	const [post] = await getPosts({ postId, loggedUser: bot.user });
	if (!post) return botError(404, 'Post not found');
	return Response.json(post);
});

/** Deletes one of the bot's own posts, with its replies. */
export const DELETE: RequestHandler = botHandler(async (bot, { params }) => {
	const postId = parseId(params.id);
	if (postId === null) return botError(400, 'Invalid post id');
	const [post] = await db
		.select({ user_id: posts.user_id })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) return botError(404, 'Post not found');
	if (post.user_id !== bot.user.id) return botError(403, 'Bots can only delete their own posts');
	if (!(await deletePost(postId))) return botError(404, 'Post not found');
	return new Response(null, { status: 204 });
});
