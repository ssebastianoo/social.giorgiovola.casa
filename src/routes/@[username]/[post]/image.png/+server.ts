import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, posts, users } from '#lib/server/db/index.js';
import { createCanvas } from '@napi-rs/canvas';
import type { CanvasRenderingContext2D } from '@napi-rs/canvas';
import { parseId } from '#lib/server/validation.js';
import { LRU } from '#lib/server/cache.js';

// Uint8Array<ArrayBuffer> rather than Buffer: Response only accepts ArrayBuffer-backed views
const cache = new LRU<Uint8Array<ArrayBuffer>>(200);

// source: https://fjolt.com/article/html-canvas-how-to-wrap-text
const wrapText = function (
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	lineHeight: number
) {
	const words = text.split(' ');
	let line = '';
	let testLine = '';
	const lineArray: [string, number, number][] = [];

	for (let n = 0; n < words.length; n++) {
		testLine += `${words[n]} `;
		const metrics = ctx.measureText(testLine);
		const testWidth = metrics.width;
		if (testWidth > maxWidth && n > 0) {
			lineArray.push([line, x, y]);
			y += lineHeight;
			line = `${words[n]} `;
			testLine = `${words[n]} `;
		} else {
			line += `${words[n]} `;
		}
		if (n === words.length - 1) {
			lineArray.push([line, x, y]);
		}
	}
	return lineArray;
};

type Post = {
	content: string;
	name: string;
	username: string;
};

export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.post);
	if (id === null) return new Response('Not found', { status: 404 });

	const res: Post[] = await db
		.select({ content: posts.content, name: users.name, username: users.username })
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.where(eq(posts.id, id));
	if (res.length === 0) return new Response('Not found', { status: 404 });
	const post = res[0];

	// keyed on the rendered text, so a renamed user or a deleted post never gets a stale card
	const key = JSON.stringify([id, post.name, post.username, post.content]);
	const cached = cache.get(key);
	if (cached) return pngResponse(cached);

	const width = 1200;
	const height = 628;

	if (post.content.length > 400) {
		post.content = post.content.slice(0, 400) + '...';
	}

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = '#799a74';
	ctx.fillRect(0, 0, width, height);

	ctx.fillStyle = '#0c0b0b';
	ctx.roundRect(100, 100, width - 200, height - 200, 10);
	ctx.fill();

	ctx.fillStyle = '#d9d9d9';
	ctx.font = '27px Roboto';
	const text = post.name + ' (@' + post.username + ')';
	ctx.fillText(text, 140, 170);
	const nameWidth = ctx.measureText(text).width;
	ctx.beginPath();
	ctx.strokeStyle = '#d9d9d9';
	ctx.moveTo(140, 180);
	ctx.lineTo(140 + nameWidth, 180);
	ctx.stroke();

	ctx.font = '27px Roboto';
	const wrappedText = wrapText(ctx, post.content, 140, 225, width - 280, 50);
	wrappedText.forEach(function (item) {
		ctx.fillText(item[0], item[1], item[2]);
	});

	const buffer = new Uint8Array(canvas.toBuffer('image/png'));
	cache.set(key, buffer);
	return pngResponse(buffer);
};

function pngResponse(buffer: Uint8Array<ArrayBuffer>) {
	return new Response(buffer, {
		headers: {
			'Content-Type': 'image/png',
			'Content-length': buffer.length.toString(),
			// not immutable: a deleted post's card shouldn't stay cached for a week
			'Cache-Control': 'public, max-age=3600'
		}
	});
}
