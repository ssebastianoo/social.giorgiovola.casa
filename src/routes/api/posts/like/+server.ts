import { and, eq } from 'drizzle-orm';
import { db, likes, posts } from '#lib/server/db/index.js';
import { parseId } from '#lib/server/validation.js';
import { publishLikes } from '#lib/server/realtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}

	const user = locals.user;
	let id: number | null = null;
	try {
		id = parseId((await request.json())?.id);
	} catch {
		// invalid JSON, handled below
	}
	if (id === null) {
		return new Response(null, { status: 400 });
	}
	const postId = id;

	const [post] = await db
		.select({ id: posts.id, user_id: posts.user_id })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) return new Response(null, { status: 404 });

	const liked = await db.transaction(async (tx) => {
		const res = await tx
			.insert(likes)
			.values({ user_id: user.id, post_id: postId })
			.onConflictDoNothing({ target: [likes.user_id, likes.post_id] })
			.returning();
		if (res.length === 0) {
			// no action, delete like
			await tx.delete(likes).where(and(eq(likes.user_id, user.id), eq(likes.post_id, postId)));
			return false;
		} else {
			// post has been liked
			return true;
		}
	});

	void publishLikes(postId, post.user_id);
	return new Response(JSON.stringify({ liked }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
