import type { RequestHandler } from './$types';
import { deleteMessage, findPeer, getBlock, sendMessage } from '#lib/server/messages.js';
import { publishMessage, publishMessageDeleted } from '#lib/server/realtime.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { LIMITS, parseId } from '#lib/server/validation.js';
import {
	ImageError,
	POST_IMAGE_SIZE,
	removeUploads,
	saveUpload,
	sniffImage,
	toWebp
} from '#lib/server/images.js';

// Sending is limited per sender, and messages carrying images (the expensive ones to process
// and store) have a tighter limit of their own.
const WINDOW_MS = 60_000;
const MAX_MESSAGES = 20;
const MAX_IMAGE_MESSAGES = 5;

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	// multipart when the message has images, plain JSON otherwise
	let to = '';
	let rawContent: unknown;
	let files: File[] = [];
	if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return new Response('Upload too big or invalid', { status: 400 });
		}
		to = String(form.get('to') ?? '');
		rawContent = form.get('content');
		files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
	} else {
		const json = await request.json().catch(() => null);
		to = typeof json?.to === 'string' ? json.to : '';
		rawContent = json?.content;
	}

	const messageKey = `dm:${locals.user.id}`;
	const imageKey = `dm-images:${locals.user.id}`;
	if (
		isLimited(messageKey, MAX_MESSAGES) ||
		(files.length > 0 && isLimited(imageKey, MAX_IMAGE_MESSAGES))
	) {
		return new Response('You are sending messages too fast, try again in a minute', {
			status: 429
		});
	}

	const content = typeof rawContent === 'string' ? rawContent.trim() : '';
	if (!content && files.length === 0) return new Response('Missing content', { status: 400 });
	if (content.length > LIMITS.messageContent) {
		return new Response(`Messages can be at most ${LIMITS.messageContent} characters`, {
			status: 400
		});
	}
	if (files.length > LIMITS.messageImages) {
		return new Response(`Messages can have at most ${LIMITS.messageImages} images`, {
			status: 400
		});
	}

	const peer = await findPeer(to);
	if (!peer) return new Response('User not found', { status: 404 });
	if (peer.id === locals.user.id) {
		return new Response("You can't message yourself", { status: 400 });
	}

	const block = await getBlock(locals.user.id, peer.id);
	if (block.me) return new Response('Unblock this user to message them', { status: 403 });
	if (block.peer) return new Response("You can't message this user", { status: 403 });

	// counted before the image processing, so a burst of concurrent requests can't skip the limit
	hit(messageKey, WINDOW_MS);
	if (files.length > 0) hit(imageKey, WINDOW_MS);

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
				{ status: 400 }
			);
		}
		uploads.push({ buffer, ext });
	}

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

	let message;
	try {
		message = await sendMessage(locals.user, peer, content, images);
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
	void publishMessage(message, locals.user.id, peer.id, locals.user.name);
	return Response.json(message);
};

/** Deletes one of your own messages, for both participants. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const json = await request.json().catch(() => null);
	const id = parseId(json?.id);
	if (id === null) return new Response('Missing message id', { status: 400 });

	const deleted = await deleteMessage(locals.user.id, id);
	// someone else's message and a missing one look the same: ids of others' messages stay private
	if (!deleted) return new Response('Message not found', { status: 404 });

	await removeUploads(deleted.images);
	void publishMessageDeleted(id, locals.user.id, deleted.recipient_id);
	return new Response(null, { status: 204 });
};
