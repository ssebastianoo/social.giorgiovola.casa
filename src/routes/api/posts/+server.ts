import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import { getAvatar } from '$lib/utils';
import { LIMITS, parseId } from '$lib/server/validation';

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const json = await request.json();
		return json && typeof json === 'object' ? json : null;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const json = await readJson(request);
	if (!json) return new Response('Invalid JSON', { status: 400 });

	const content = typeof json.content === 'string' ? json.content.trim() : '';
	if (!content) {
		return new Response('Missing content', { status: 400 });
	}
	if (content.length > LIMITS.postContent) {
		return new Response(`Posts can be at most ${LIMITS.postContent} characters`, { status: 400 });
	}

	let reply_to: number | null = null;
	if (json.reply_to != null) {
		reply_to = parseId(json.reply_to);
		if (reply_to === null) return new Response('Invalid reply_to', { status: 400 });
		const parent = await sql`SELECT id FROM posts WHERE id = ${reply_to}`;
		if (parent.length === 0) return new Response('Post not found', { status: 404 });
	}

	const posts = await sql`
		INSERT INTO POSTS (user_id, content, reply_to) VALUES (${locals.user.id}, ${content}, ${reply_to})
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
	if (!reply_to && privateEnv.DISCORD_WEBHOOK_URL) {
		// a broken webhook shouldn't make posting fail
		try {
			await fetch(privateEnv.DISCORD_WEBHOOK_URL + '?wait=false', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: `${env.PUBLIC_URL}/@${posts[0].user.username}/${posts[0].id}`,
					username: posts[0].user.name,
					avatar_url: getAvatar(posts[0].user, 512, true)
				})
			});
		} catch (e) {
			console.error('Discord webhook failed', e);
		}
	}
	return new Response(JSON.stringify(posts[0]), {
		headers: { 'Content-Type': 'application/json' }
	});
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	const json = await readJson(request);
	const postId = parseId(json?.id);
	if (postId === null) {
		return new Response('Missing post id', { status: 400 });
	}

	const deleted = await sql`
		DELETE FROM posts WHERE id = ${postId} AND user_id = ${locals.user.id}
		RETURNING id
	`;
	if (deleted.length === 0) {
		const exists = await sql`SELECT id FROM posts WHERE id = ${postId}`;
		return exists.length === 0
			? new Response('Post not found', { status: 404 })
			: new Response('Forbidden', { status: 403 });
	}

	return new Response('Post deleted');
};
