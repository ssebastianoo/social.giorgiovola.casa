import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { db, posts, users } from '#lib/server/db/index.js';
import { DISCORD_WEBHOOK_URL } from '$app/env/private';
import { PUBLIC_URL } from '$app/env/public';
import { getAvatar } from '#lib/utils.js';
import { LIMITS, parseId } from '#lib/server/validation.js';
import { imagesOfPostTrees, removeUploads, saveUpload, sniffImage } from '#lib/server/images.js';
import { publishPost, publishDeleted } from '#lib/server/realtime.js';

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

	// multipart when the post has images, plain JSON otherwise
	let body: Record<string, unknown> | null;
	let files: File[] = [];
	if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return new Response('Upload too big or invalid', { status: 400 });
		}
		body = { content: form.get('content'), reply_to: form.get('reply_to') || null };
		files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
	} else {
		body = await readJson(request);
		if (!body) return new Response('Invalid JSON', { status: 400 });
	}

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content && files.length === 0) {
		return new Response('Missing content', { status: 400 });
	}
	if (content.length > LIMITS.postContent) {
		return new Response(`Posts can be at most ${LIMITS.postContent} characters`, { status: 400 });
	}
	if (files.length > LIMITS.postImages) {
		return new Response(`Posts can have at most ${LIMITS.postImages} images`, { status: 400 });
	}

	// validate everything before anything is written to disk
	const uploads: { buffer: Buffer; ext: string }[] = [];
	for (const file of files) {
		if (file.size > LIMITS.imageBytes) {
			return new Response('Image too big, max size is 10mb', { status: 400 });
		}
		const buffer = Buffer.from(await file.arrayBuffer());
		const ext = sniffImage(buffer);
		if (!ext) {
			return new Response(
				'Unsupported image type, use PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG',
				{
					status: 400
				}
			);
		}
		uploads.push({ buffer, ext });
	}

	let reply_to: number | null = null;
	if (body.reply_to != null) {
		reply_to = parseId(body.reply_to);
		if (reply_to === null) return new Response('Invalid reply_to', { status: 400 });
		const parent = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, reply_to));
		if (parent.length === 0) return new Response('Post not found', { status: 404 });
	}

	const images = await Promise.all(uploads.map((u) => saveUpload(u.buffer, u.ext)));

	let created;
	try {
		[created] = await db
			.insert(posts)
			.values({ user_id: locals.user.id, content, images, reply_to })
			.returning({
				content: posts.content,
				images: posts.images,
				created_at: posts.created_at,
				edited_at: posts.edited_at,
				id: posts.id
			});
	} catch (e) {
		await removeUploads(images);
		throw e;
	}

	let parentRef: { id: number; username: string } | null = null;
	if (reply_to !== null) {
		const [parent] = await db
			.select({ id: posts.id, username: users.username })
			.from(posts)
			.innerJoin(users, eq(posts.user_id, users.id))
			.where(eq(posts.id, reply_to));
		parentRef = parent ?? null;
	}
	const { id, username, name, avatar } = locals.user;
	const post = { ...created, reply_to: parentRef, user: { id, username, name, avatar } };

	void publishPost(post.id);
	if (!reply_to && DISCORD_WEBHOOK_URL) {
		// a broken webhook shouldn't make posting fail
		try {
			await fetch(DISCORD_WEBHOOK_URL + '?wait=false', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: `${PUBLIC_URL}/@${post.user.username}/${post.id}`,
					username: post.user.name,
					avatar_url: getAvatar(post.user, 512, true)
				})
			});
		} catch (e) {
			console.error('Discord webhook failed', e);
		}
	}
	return new Response(JSON.stringify(post), {
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

	// replies go with the post: collect the images of the whole thread first
	const images = await imagesOfPostTrees(sql`id = ${postId} AND user_id = ${locals.user.id}`);
	const deleted = await db
		.delete(posts)
		.where(and(eq(posts.id, postId), eq(posts.user_id, locals.user.id)))
		.returning({ id: posts.id, reply_to: posts.reply_to });
	if (deleted.length === 0) {
		const exists = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId));
		return exists.length === 0
			? new Response('Post not found', { status: 404 })
			: new Response('Forbidden', { status: 403 });
	}

	await removeUploads(images);
	publishDeleted(postId, deleted[0].reply_to);
	return new Response('Post deleted');
};
