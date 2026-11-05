import { db, inbox } from '#lib/server/db/index.js';
import { and, eq, isNull } from 'drizzle-orm';
import { getSwitcher } from '#lib/server/accounts.js';
import { unreadMessageCount } from '#lib/server/messages.js';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	let notisCount = 0;
	let messagesCount = 0;
	if (locals.user) {
		messagesCount = await unreadMessageCount(locals.user.id);
		notisCount = await db.$count(
			inbox,
			and(eq(inbox.user_id, locals.user.id), isNull(inbox.read_at))
		);
	}

	return {
		user: locals.user,
		role: locals.role,
		muted: locals.muted,
		muteReason: locals.muteReason,
		notisCount,
		messagesCount,
		accounts: await getSwitcher(locals)
	};
}) satisfies LayoutServerLoad;
