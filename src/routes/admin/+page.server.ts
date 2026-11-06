import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, identity_members, sessions, users } from '#lib/server/db/index.js';
import { hashPassword } from '#lib/server/password.js';
import {
	actionsLimited,
	banAccount,
	canModerate,
	findTarget,
	isStaff,
	muteAccount,
	setAccountRole,
	unbanAccount,
	unmuteAccount,
	type ModerationTarget
} from '#lib/server/moderation.js';
import { validatePassword } from '#lib/server/validation.js';

const PAGE_SIZE = 25;
const MAX_PAGE = 10_000;
const MAX_REASON = 200;
const FILTERS = ['all', 'banned', 'muted', 'staff'] as const;
type Filter = (typeof FILTERS)[number];

export const load = (async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	// staff only, and nothing to tell everyone else
	if (!isStaff(locals.role)) error(404, 'Not found');

	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
	const rawFilter = url.searchParams.get('filter');
	const filter: Filter = FILTERS.find((f) => f === rawFilter) ?? 'all';
	const rawPage = url.searchParams.get('page') ?? '0';
	const page = /^\d{1,5}$/.test(rawPage) ? Math.min(Number(rawPage), MAX_PAGE) : 0;

	// moderation targets accounts: identities follow the account that owns them
	const filters: (SQL | undefined)[] = [isNull(users.owner_id)];
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
		filters.push(
			or(
				sql`${users.username} ILIKE ${like}`,
				sql`${users.name} ILIKE ${like}`,
				// searching an identity (or bot) finds the account behind it, and so does one shared
				// with the account; the table names are written out so they can't be mis-qualified
				sql`EXISTS (SELECT 1 FROM users i WHERE i.owner_id = users.id
					AND (i.username ILIKE ${like} OR i.name ILIKE ${like}))`,
				sql`EXISTS (SELECT 1 FROM identity_members m JOIN users i ON i.id = m.identity_id
					WHERE m.account_id = users.id AND (i.username ILIKE ${like} OR i.name ILIKE ${like}))`
			)
		);
	}
	if (filter === 'banned') filters.push(isNotNull(users.banned_at));
	if (filter === 'muted') filters.push(isNotNull(users.muted_at));
	if (filter === 'staff') filters.push(ne(users.role, 'user'));

	const rows = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			role: users.role,
			banned_at: users.banned_at,
			ban_reason: users.ban_reason,
			muted_at: users.muted_at,
			mute_reason: users.mute_reason,
			created_at: users.created_at
		})
		.from(users)
		.where(and(...filters))
		.orderBy(desc(users.created_at), desc(users.id))
		.limit(PAGE_SIZE + 1)
		.offset(page * PAGE_SIZE);

	const accounts = rows.slice(0, PAGE_SIZE);
	const identities = await loadIdentities(accounts.map((r) => r.id));

	const admin = locals.role === 'admin';
	return {
		role: locals.role,
		q,
		filter,
		page,
		hasMore: rows.length > PAGE_SIZE,
		// what the signed in staff member may do to each account (ids stay on the server)
		users: accounts.map(({ id, ...row }) => {
			const allowed = canModerate(locals, { id, role: row.role });
			return {
				...row,
				...identities(id),
				self: id === locals.accountId,
				canModerate: allowed,
				canManage: admin && allowed
			};
		})
	};
}) satisfies PageServerLoad;

/**
 * The identities (and bots) each account owns, with who they are shared with, and the
 * identities of others shared with it, so staff can see who is behind a profile.
 */
async function loadIdentities(accountIds: number[]) {
	if (accountIds.length === 0) return () => ({ identities: [], sharedWith: [] });

	const owned = await db
		.select({
			id: users.id,
			owner_id: users.owner_id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			bot: users.bot
		})
		.from(users)
		.where(inArray(users.owner_id, accountIds))
		.orderBy(asc(users.created_at), asc(users.id));

	const member = alias(users, 'member');
	const members =
		owned.length === 0
			? []
			: await db
					.select({ identity_id: identity_members.identity_id, username: member.username })
					.from(identity_members)
					.innerJoin(member, eq(member.id, identity_members.account_id))
					.where(
						inArray(
							identity_members.identity_id,
							owned.map((i) => i.id)
						)
					)
					.orderBy(asc(identity_members.created_at));

	const identity = alias(users, 'identity');
	const owner = alias(users, 'owner');
	const shared = await db
		.select({
			account_id: identity_members.account_id,
			username: identity.username,
			name: identity.name,
			avatar: identity.avatar,
			owner_username: owner.username
		})
		.from(identity_members)
		.innerJoin(identity, eq(identity.id, identity_members.identity_id))
		.innerJoin(owner, eq(owner.id, identity.owner_id))
		.where(inArray(identity_members.account_id, accountIds))
		.orderBy(asc(identity_members.created_at));

	return (accountId: number) => ({
		identities: owned
			.filter((i) => i.owner_id === accountId)
			.map((i) => ({
				username: i.username,
				name: i.name,
				avatar: i.avatar,
				bot: i.bot,
				members: members.filter((m) => m.identity_id === i.id).map((m) => m.username)
			})),
		sharedWith: shared
			.filter((s) => s.account_id === accountId)
			.map((s) => ({
				username: s.username,
				name: s.name,
				avatar: s.avatar,
				owner_username: s.owner_username
			}))
	});
}

type Authorized = { target: ModerationTarget; data: FormData; denied?: undefined };
type Denied = { denied: ActionFailure<{ error: string }> };

/** Checks the caller is allowed to act on the posted `username` (an account or one of its identities). */
async function authorize(
	locals: App.Locals,
	request: Request,
	adminOnly = false
): Promise<Authorized | Denied> {
	if (!locals.user || !isStaff(locals.role) || (adminOnly && locals.role !== 'admin'))
		return { denied: fail(403, { error: 'Forbidden.' }) };
	if (actionsLimited(locals.user.id))
		return { denied: fail(429, { error: 'Too many actions, slow down.' }) };

	const data = await request.formData();
	const username = data.get('username');
	if (typeof username !== 'string' || !username)
		return { denied: fail(400, { error: 'Missing username.' }) };

	const target = await findTarget(username);
	if (!target) return { denied: fail(404, { error: 'User not found.' }) };
	if (!canModerate(locals, target))
		return { denied: fail(403, { error: `You can't moderate @${target.username}.` }) };
	return { target, data };
}

export const actions = {
	ban: async ({ locals, request }) => {
		const auth = await authorize(locals, request);
		if (auth.denied) return auth.denied;
		const reason = String(auth.data.get('reason') ?? '')
			.trim()
			.slice(0, MAX_REASON);
		await banAccount(auth.target.id, reason || null);
		return { message: `Banned @${auth.target.username}.` };
	},

	unban: async ({ locals, request }) => {
		const auth = await authorize(locals, request);
		if (auth.denied) return auth.denied;
		await unbanAccount(auth.target.id);
		return { message: `Unbanned @${auth.target.username}.` };
	},

	mute: async ({ locals, request }) => {
		const auth = await authorize(locals, request);
		if (auth.denied) return auth.denied;
		const reason = String(auth.data.get('reason') ?? '')
			.trim()
			.slice(0, MAX_REASON);
		await muteAccount(auth.target.id, reason || null);
		return { message: `Muted @${auth.target.username}.` };
	},

	unmute: async ({ locals, request }) => {
		const auth = await authorize(locals, request);
		if (auth.denied) return auth.denied;
		await unmuteAccount(auth.target.id);
		return { message: `Unmuted @${auth.target.username}.` };
	},

	/** Makes an account a mod, or a regular user again. Admins are made with `bun admin.ts`. */
	role: async ({ locals, request }) => {
		const auth = await authorize(locals, request, true);
		if (auth.denied) return auth.denied;
		const role = auth.data.get('role');
		if (role !== 'mod' && role !== 'user') return fail(400, { error: 'Invalid role.' });
		await setAccountRole(auth.target.id, role);
		return {
			message:
				role === 'mod'
					? `@${auth.target.username} is now a mod.`
					: `@${auth.target.username} is no longer a mod.`
		};
	},

	/** Sets a new password and signs the account out everywhere. */
	password: async ({ locals, request }) => {
		const auth = await authorize(locals, request, true);
		if (auth.denied) return auth.denied;
		const password = auth.data.get('password');
		if (typeof password !== 'string') return fail(400, { error: 'Missing password.' });
		const invalid = validatePassword(password);
		if (invalid) return fail(400, { error: invalid });

		const { salt, hash } = await hashPassword(password);
		await db.update(users).set({ password: hash, salt }).where(eq(users.id, auth.target.id));
		await db.delete(sessions).where(eq(sessions.user_id, auth.target.id));
		return { message: `Password of @${auth.target.username} reset.` };
	}
} satisfies Actions;
