import type { RequestHandler } from './$types';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateAvatar } from '$lib/server/avatar';

// Discord and social cards don't accept SVGs, so render a PNG for those
export const GET: RequestHandler = async ({ params, url }) => {
	const size = Math.min(Number(url.searchParams.get('size')) || 512, 1024);
	const img = await loadImage(Buffer.from(generateAvatar(params.username, size)));
	const canvas = createCanvas(size, size);
	canvas.getContext('2d').drawImage(img, 0, 0, size, size);
	const buffer = canvas.toBuffer('image/png');
	return new Response(buffer, {
		headers: {
			'Content-Type': 'image/png',
			'Content-length': buffer.length.toString(),
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
