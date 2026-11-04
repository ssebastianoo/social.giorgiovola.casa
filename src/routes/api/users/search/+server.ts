import type { RequestHandler } from './$types';
import { asc, desc, ilike, or, sql } from 'drizzle-orm';
import { db, users } from '#lib/server/db/index.js';

const MAX_RESULTS = 6;

/** Users matching `q` (username or name prefix), for the @mention autocomplete. */
export const GET: RequestHandler = async ({ locals, url }) => {
	// signed in only, so the user list can't be scraped anonymously
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 32);
	// the same characters a mention can contain, which also keeps LIKE wildcards out
	if (!/^[a-z0-9_]*$/.test(q)) return Response.json([]);

	const rows = await db
		.select({ username: users.username, name: users.name, avatar: users.avatar })
		.from(users)
		.where(q ? or(ilike(users.username, `${q}%`), ilike(users.name, `${q}%`)) : undefined)
		// exact username first, then username prefix matches, then name matches
		.orderBy(
			q
				? sql`(${users.username} = ${q}) DESC, (${users.username} ILIKE ${q + '%'}) DESC`
				: desc(users.created_at),
			asc(users.username)
		)
		.limit(MAX_RESULTS);

	return Response.json(rows);
};
