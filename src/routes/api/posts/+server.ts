import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { DISCORD_WEBHOOK_URL } from '$env/static/private';
import { PUBLIC_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	const limitCheck = await sql`
		SELECT COUNT(*) FROM posts WHERE user_id = ${locals.user.id} AND created_at > NOW() - INTERVAL '5 seconds'
	`;
	if (limitCheck[0].count >= 1) {
		return new Response('You can only post once every 5 seconds', { status: 429 });
	}

	const json = await request.json();

	if (!json.content) {
		return new Response('Missing content', { status: 400 });
	}

	const { content, reply_to } = json;
	const posts = await sql`
		INSERT INTO POSTS (user_id, content, reply_to) VALUES (${locals.user.id}, ${content}, ${
		reply_to || null
	})
		RETURNING content, created_at, edited_at, id, (SELECT jsonb_build_object(
            'id', p.id,
            'username', u.username
        ) FROM posts p INNER JOIN users u ON p.user_id = u.id WHERE p.id = posts.reply_to) AS reply_to, (SELECT jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'name', u.name,
            'avatar', u.avatar
        ) FROM users u WHERE u.id = user_id) AS user
            
	`;
	if (!reply_to) {
		await fetch(DISCORD_WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				content: `${PUBLIC_URL}/@${posts[0].user.username}/${posts[0].id}`
			})
		});
	}
	return new Response(JSON.stringify(posts[0]));
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	const json = await request.json();

	if (!json.id) {
		return new Response('Missing post id', { status: 400 });
	}

	const postId = json.id;

	const posts = await sql`
		SELECT * FROM posts WHERE id = ${postId}
	`;

	if (posts.length === 0) {
		return new Response('Post not found', { status: 404 });
	}

	if (posts[0].user_id !== locals.user.id) {
		return new Response('Unauthorized', { status: 401 });
	}

	await sql`
		DELETE FROM posts WHERE id = ${postId}
	`;

	return new Response('Post deleted');
};
