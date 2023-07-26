import type { RequestHandler } from './$types';
import { sql } from '$lib/db';

export const POST: RequestHandler = async ({ cookies, request }) => {
	const token = cookies.get('social.giorgiovola.casa-token');
	if (!token) {
		return new Response('Unauthorized', { status: 401 });
	}

	const res = await sql`
		SELECT user_id FROM sessions WHERE token = ${token}
	`;
	if (res.length === 0) {
		return new Response('Unauthorized', { status: 401 });
	}
	const user_id = res[0].user_id;
	const json = await request.json();

	if (!json.content) {
		return new Response('Missing content', { status: 400 });
	}

	const content = json.content;

	const posts = await sql`
		INSERT INTO POSTS (user_id, content) VALUES (${user_id}, ${content})
		RETURNING content, created_at, edited_at
	`;
	const users = await sql`
		SELECT id, name, username, email, avatar FROM users WHERE id = ${user_id}
	`;
	posts[0].user = users[0];

	return new Response(JSON.stringify(posts[0]));
};

export const DELETE: RequestHandler = async ({ cookies, request }) => {
	const token = cookies.get('social.giorgiovola.casa-token');
	if (!token) {
		return new Response('Unauthorized', { status: 401 });
	}

	const res = await sql`
		SELECT user_id FROM sessions WHERE token = ${token}
	`;
	if (res.length === 0) {
		return new Response('Unauthorized', { status: 401 });
	}
	const user_id = res[0].user_id;
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

	if (posts[0].user_id !== user_id) {
		return new Response('Unauthorized', { status: 401 });
	}

	await sql`
		DELETE FROM posts WHERE id = ${postId}
	`;

	return new Response('Post deleted');
};
