import type { RequestHandler } from './$types';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateAvatar } from '$lib/server/avatar';
import { avatarSize } from '$lib/server/avatarSize';
import { LRU } from '$lib/server/cache';
import { sql } from '$lib/server/db';

const cache = new LRU<Buffer>(300);

// Discord and social cards don't accept SVGs, so render a PNG for those
export const GET: RequestHandler = async ({ params, url }) => {
	const size = avatarSize(url.searchParams.get('size'), 512);
	const key = `${params.username}:${size}`;

	let buffer = cache.get(key);
	if (!buffer) {
		// only render for real users, otherwise random names make every request a cache miss
		const users = await sql`SELECT 1 FROM users WHERE username = ${params.username}`;
		if (users.length === 0) return new Response('Not found', { status: 404 });

		const img = await loadImage(Buffer.from(generateAvatar(params.username, size)));
		const canvas = createCanvas(size, size);
		canvas.getContext('2d').drawImage(img, 0, 0, size, size);
		buffer = canvas.toBuffer('image/png');
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
