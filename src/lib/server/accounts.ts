import fs from 'fs';
import { asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db, users } from './db/index.js';
import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';

/** How many identities a single account can own. */
export const MAX_IDENTITIES = 10;

const AVATAR_EXTS = ['png', 'jpg', 'gif', 'webp'];

/** Every account signed in on this browser with its identities, in sign-in order. */
export async function getSwitcher(locals: App.Locals): Promise<SwitcherAccount[]> {
	if (!locals.user || locals.sessions.length === 0) return [];
	const accountIds = locals.sessions.map((s) => s.accountId);

	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			owner_id: users.owner_id,
			// correlated subquery: the table names are written out so they can't be mis-qualified
			unread: sql<number>`(
				(SELECT COUNT(*) FROM inbox WHERE inbox.user_id = users.id AND inbox.read_at IS NULL)
				+ (SELECT COUNT(*) FROM messages WHERE messages.recipient_id = users.id AND messages.read_at IS NULL)
			)::int`
		})
		.from(users)
		.where(or(inArray(users.id, accountIds), inArray(users.owner_id, accountIds)))
		.orderBy(asc(users.created_at), asc(users.id));

	const profile = (r: (typeof rows)[number]): SwitcherProfile => ({
		id: r.id,
		name: r.name,
		username: r.username,
		avatar: r.avatar,
		unread: r.unread,
		active: r.id === locals.user?.id
	});

	return accountIds.flatMap((id) => {
		const account = rows.find((r) => r.id === id);
		if (!account) return [];
		return [
			{
				...profile(account),
				identities: rows.filter((r) => r.owner_id === id).map(profile)
			}
		];
	});
}

/**
 * Finds the signed in session that can act as `userId` (its account, or the account owning
 * the identity). Returns null when nobody signed in on this browser owns that profile.
 */
export async function findSessionFor(locals: App.Locals, userId: number) {
	const [target] = await db
		.select({ id: users.id, owner_id: users.owner_id })
		.from(users)
		.where(eq(users.id, userId));
	if (!target) return null;
	const accountId = target.owner_id ?? target.id;
	const session = locals.sessions.find((s) => s.accountId === accountId);
	if (!session) return null;
	return { session, actingId: target.owner_id === null ? null : target.id };
}

export async function removeAvatarFiles(userId: number) {
	for (const ext of AVATAR_EXTS) {
		await fs.promises.rm(`static/avatars/${userId}.${ext}`, { force: true });
	}
}

/** A same-site path to go back to after a form post, so `//evil.com` can't be used. */
export function safeRedirect(value: unknown, fallback = '/') {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
		return fallback;
	if (value.includes('\\')) return fallback;
	return value;
}
