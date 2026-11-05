import type { RequestHandler } from './$types';
import { search } from '#lib/server/search.js';

const MAX_RESULTS = 5;

/** Users and hashtags for the header search box. */
export const GET: RequestHandler = async ({ locals, url }) => {
	// signed in only, so the user list can't be scraped anonymously
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const { users, hashtags } = await search(url.searchParams.get('q') ?? '', MAX_RESULTS);
	return Response.json({ users, hashtags });
};
