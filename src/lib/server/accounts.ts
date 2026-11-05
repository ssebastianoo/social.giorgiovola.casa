import fs from 'fs';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, identity_members, users } from './db/index.js';
import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';

/** How many identities a single account can own. */
export const MAX_IDENTITIES = 10;

const AVATAR_EXTS = ['png', 'jpg', 'gif', 'webp'];

/** How many other accounts a single identity can be shared with. */
export const MAX_MEMBERS = 10;

/** Every account signed in on this browser with its identities (owned or shared), in sign-in order. */
export async function getSwitcher(locals: App.Locals): Promise<SwitcherAccount[]> {
	if (!locals.user || locals.sessions.length === 0) return [];
	const accountIds = locals.sessions.map((s) => s.accountId);

	const shared = await db
		.select({ identity_id: identity_members.identity_id, account_id: identity_members.account_id })
		.from(identity_members)
		.where(inArray(identity_members.account_id, accountIds));
	const sharedIds = shared.map((m) => m.identity_id);

	const owner = alias(users, 'owner');
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			owner_id: users.owner_id,
			owner_username: owner.username,
			// correlated subquery: the table names are written out so they can't be mis-qualified
			unread: sql<number>`(
				(SELECT COUNT(*) FROM inbox WHERE inbox.user_id = users.id AND inbox.read_at IS NULL)
				+ (SELECT COUNT(*) FROM messages WHERE messages.recipient_id = users.id AND messages.read_at IS NULL)
			)::int`
		})
		.from(users)
		.leftJoin(owner, eq(owner.id, users.owner_id))
		.where(
			or(
				inArray(users.id, accountIds),
				inArray(users.owner_id, accountIds),
				// shared identities stop showing up while their owner is banned
				sharedIds.length > 0
					? and(inArray(users.id, sharedIds), isNull(owner.banned_at))
					: undefined
			)
		)
		.orderBy(asc(users.created_at), asc(users.id));

	const profile = (r: (typeof rows)[number], accountId: number): SwitcherProfile => ({
		id: r.id,
		name: r.name,
		username: r.username,
		avatar: r.avatar,
		unread: r.unread,
		active: r.id === locals.user?.id && accountId === locals.accountId,
		sharedBy: r.owner_id !== null && r.owner_id !== accountId ? r.owner_username : null
	});

	return accountIds.flatMap((id) => {
		const account = rows.find((r) => r.id === id);
		if (!account) return [];
		const mine = new Set(shared.filter((m) => m.account_id === id).map((m) => m.identity_id));
		return [
			{
				...profile(account, id),
				identities: rows
					.filter((r) => r.owner_id === id || mine.has(r.id))
					.map((r) => profile(r, id))
			}
		];
	});
}

/**
 * Finds the signed in session that can act as `userId`: its account, the account owning the
 * identity, or an account it is shared with (preferring the owner). Returns null when nobody
 * signed in on this browser can use that profile.
 */
export async function findSessionFor(locals: App.Locals, userId: number) {
	const owner = alias(users, 'owner');
	const [target] = await db
		.select({ id: users.id, owner_id: users.owner_id, owner_banned_at: owner.banned_at })
		.from(users)
		.leftJoin(owner, eq(owner.id, users.owner_id))
		.where(eq(users.id, userId));
	if (!target) return null;
	if (target.owner_id === null) {
		const session = locals.sessions.find((s) => s.accountId === target.id);
		return session ? { session, actingId: null } : null;
	}
	const own = locals.sessions.find((s) => s.accountId === target.owner_id);
	if (own) return { session: own, actingId: target.id };
	if (target.owner_banned_at) return null;
	const members = await db
		.select({ account_id: identity_members.account_id })
		.from(identity_members)
		.where(
			and(
				eq(identity_members.identity_id, target.id),
				inArray(
					identity_members.account_id,
					locals.sessions.map((s) => s.accountId)
				)
			)
		);
	const session = locals.sessions.find((s) => members.some((m) => m.account_id === s.accountId));
	return session ? { session, actingId: target.id } : null;
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
