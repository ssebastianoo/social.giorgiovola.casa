import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

// adapter-node only serves files that existed at build time, so avatars uploaded
// at runtime (stored in static/avatars) have to be served by a route.
const types: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif'
};

export const GET: RequestHandler = async ({ params }) => {
	const file = path.basename(params.file);
	const ext = file.split('.').pop()?.toLowerCase() ?? '';
	const type = types[ext];
	if (!type || file !== params.file) return new Response('Not found', { status: 404 });

	try {
		const data = await fs.promises.readFile(path.join('static', 'avatars', file));
		return new Response(data, {
			headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000' }
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
};
