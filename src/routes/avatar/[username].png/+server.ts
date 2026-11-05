import type { RequestHandler } from './$types';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateAvatar } from '#lib/server/avatar.js';
import { avatarSize } from '#lib/server/avatarSize.js';
import { LRU } from '#lib/server/cache.js';
import { eq } from 'drizzle-orm';
import { db, users } from '#lib/server/db/index.js';

// Uint8Array<ArrayBuffer> rather than Buffer: Response only accepts ArrayBuffer-backed views
const cache = new LRU<Uint8Array<ArrayBuffer>>(300);

// Discord and social cards don't accept SVGs, so render a PNG for those
export const GET: RequestHandler = async ({ params, url }) => {
	const size = avatarSize(url.searchParams.get('size'), 512);
	const key = `${params.username}:${size}`;

	let buffer = cache.get(key);
	if (!buffer) {
		// only render for real users, otherwise random names make every request a cache miss
		const found = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, params.username));
		if (found.length === 0) return new Response('Not found', { status: 404 });

		const img = await loadImage(Buffer.from(generateAvatar(params.username, size)));
		const canvas = createCanvas(size, size);
		canvas.getContext('2d').drawImage(img, 0, 0, size, size);
		buffer = new Uint8Array(canvas.toBuffer('image/png'));
		cache.set(key, buffer);
	}
	return new Response(buffer, {
		headers: {
			'Content-Type': 'image/png',
			'Content-length': buffer.length.toString(),
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
