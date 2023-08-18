import { sql } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	let notisCount = null;
	if (locals.user) {
		const res = await sql`
        SELECT COUNT(*) FROM inbox WHERE user_id = ${locals.user.id} AND read_at IS NULL
        `;
		notisCount = res[0].count;
	}

	return {
		user: locals.user,
		notisCount
	};
}) satisfies LayoutServerLoad;
