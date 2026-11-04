import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, uploadType } from '#lib/server/images.js';

// like avatars, uploads are written at runtime so adapter-node's static handler can't serve them.
// File names are random uuids, so responses are immutable.
export const GET: RequestHandler = async ({ params }) => {
	const type = uploadType(params.file);
	if (!type) return new Response('Not found', { status: 404 });

	try {
		const data = await fs.promises.readFile(path.join(UPLOAD_DIR, params.file));
		return new Response(data, {
			headers: {
				'Content-Type': type,
				'Content-Length': data.length.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable',
				// an SVG opened on its own would otherwise run its scripts on our origin
				'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			}
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
};
