import type { RequestHandler } from './$types';
import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, posts, users } from '#lib/server/db/index.js';
import { checkPostRefs, createPost, deletePost } from '#lib/server/posts.js';
import { LIMITS, parseId } from '#lib/server/validation.js';
import {
	ImageError,
	POST_IMAGE_SIZE,
	removeUploads,
	saveUpload,
	sniffImage,
	toWebp
} from '#lib/server/images.js';
import { actionsLimited, mutedMessage, canDeletePostOf } from '#lib/server/moderation.js';

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
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });

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
		body = {
			content: form.get('content'),
			reply_to: form.get('reply_to') || null,
			quote_of: form.get('quote_of') || null
		};
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

	const reply_to = body.reply_to != null ? parseId(body.reply_to) : null;
	if (body.reply_to != null && reply_to === null)
		return new Response('Invalid reply_to', { status: 400 });
	const quote_of = body.quote_of != null ? parseId(body.quote_of) : null;
	if (body.quote_of != null && quote_of === null)
		return new Response('Invalid quote_of', { status: 400 });
	const refError = await checkPostRefs(reply_to, quote_of);
	if (refError) return new Response(refError.message, { status: refError.status });

	let optimized: Buffer[];
	try {
		optimized = await Promise.all(
			uploads.map((u) => toWebp(u.buffer, u.ext, { size: POST_IMAGE_SIZE }))
		);
	} catch (e) {
		if (e instanceof ImageError) return new Response(e.message, { status: 400 });
		throw e;
	}
	const images = await Promise.all(optimized.map(saveUpload));

	let post;
	try {
		post = await createPost(locals.user, { content, images, reply_to, quote_of });
	} catch (e) {
		await removeUploads(images);
		throw e;
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

	// the author's account decides whether a moderator may delete it
	const account = alias(users, 'account');
	const [target] = await db
		.select({ user_id: posts.user_id, role: account.role })
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.innerJoin(account, eq(account.id, sql`COALESCE(${users.owner_id}, ${users.id})`))
		.where(eq(posts.id, postId));
	if (!target) return new Response('Post not found', { status: 404 });
	if (target.user_id !== locals.user.id) {
		if (!canDeletePostOf(locals, target.role)) return new Response('Forbidden', { status: 403 });
		if (actionsLimited(locals.user.id)) return new Response('Too many requests', { status: 429 });
	}

	if (!(await deletePost(postId))) return new Response('Post not found', { status: 404 });
	return new Response('Post deleted');
};
