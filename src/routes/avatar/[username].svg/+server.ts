import type { RequestHandler } from './$types';
import { generateAvatar } from '$lib/server/avatar';

export const GET: RequestHandler = async ({ params, url }) => {
	const size = Math.min(Number(url.searchParams.get('size')) || 80, 1024);
	return new Response(generateAvatar(params.username, size), {
		headers: {
			'Content-Type': 'image/svg+xml',
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
