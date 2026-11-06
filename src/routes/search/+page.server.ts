import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { search } from '#lib/server/search.js';

const MAX_RESULTS = 20;

export const load = (async ({ locals, url }) => {
	// like the search API: no anonymous user listing
	if (!locals.user) redirect(303, '/login');
	return search(url.searchParams.get('q') ?? '', MAX_RESULTS);
}) satisfies PageServerLoad;
