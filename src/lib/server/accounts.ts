import fs from 'fs';
import { sql } from './db';
import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';

/** How many identities a single account can own. */
export const MAX_IDENTITIES = 10;

const AVATAR_EXTS = ['png', 'jpg', 'gif', 'webp'];

/** Every account signed in on this browser with its identities, in sign-in order. */
export async function getSwitcher(locals: App.Locals): Promise<SwitcherAccount[]> {
	if (!locals.user || locals.sessions.length === 0) return [];
	const accountIds = locals.sessions.map((s) => s.accountId);

	const rows = await sql`
		SELECT users.id, users.name, users.username, users.avatar, users.owner_id,
			(SELECT COUNT(*) FROM inbox WHERE inbox.user_id = users.id AND inbox.read_at IS NULL)::int AS unread
		FROM users
		WHERE users.id IN ${sql(accountIds)} OR users.owner_id IN ${sql(accountIds)}
		ORDER BY users.created_at ASC, users.id ASC
	`;

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
	const users = await sql`SELECT id, owner_id FROM users WHERE id = ${userId}`;
	if (users.length === 0) return null;
	const accountId: number = users[0].owner_id ?? users[0].id;
	const session = locals.sessions.find((s) => s.accountId === accountId);
	if (!session) return null;
	return { session, actingId: users[0].owner_id === null ? null : (users[0].id as number) };
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
