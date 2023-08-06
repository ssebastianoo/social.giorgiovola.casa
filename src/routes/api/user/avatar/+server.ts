import type { RequestHandler } from './$types';
// import { sql } from '$lib/server/db';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// save the file locally
	const buffer = await request.arrayBuffer();
	const file = new File([buffer], 'avatar.png', { type: 'image/png' });

	return new Response();
};
