import type { RequestHandler } from './$types';
import { generateAvatar } from '#lib/server/avatar.js';
import { avatarSize } from '#lib/server/avatarSize.js';

export const GET: RequestHandler = async ({ params, url }) => {
	const size = avatarSize(url.searchParams.get('size'), 80);
	return new Response(generateAvatar(params.username, size), {
		headers: {
			'Content-Type': 'image/svg+xml',
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
