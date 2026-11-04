import { db, inbox } from '#lib/server/db/index.js';
import { and, eq, isNull } from 'drizzle-orm';
import { getSwitcher } from '#lib/server/accounts.js';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	let notisCount = 0;
	if (locals.user) {
		notisCount = await db.$count(
			inbox,
			and(eq(inbox.user_id, locals.user.id), isNull(inbox.read_at))
		);
	}

	return {
		user: locals.user,
		notisCount,
		accounts: await getSwitcher(locals)
	};
}) satisfies LayoutServerLoad;
