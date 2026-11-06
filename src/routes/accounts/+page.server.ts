import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, identity_members, sessions, users } from '#lib/server/db/index.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { imagesOfPostTrees, removeUploads } from '#lib/server/images.js';
import { setSessionCookies } from '#lib/server/session.js';
import {
	MAX_IDENTITIES,
	MAX_MEMBERS,
	findSessionFor,
	removeAvatarFiles,
	safeRedirect
} from '#lib/server/accounts.js';
import {
	isUniqueViolation,
	parseId,
	validateName,
	validateUsername
} from '#lib/server/validation.js';

export const load = (async ({ locals }) => {
	if (!locals.user || !locals.accountId) redirect(303, '/login');
	// who each identity of the signed in account is shared with
	const members = await db
		.select({
			identity_id: identity_members.identity_id,
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar
		})
		.from(identity_members)
		.innerJoin(users, eq(users.id, identity_members.account_id))
		.where(
			inArray(
				identity_members.identity_id,
				db.select({ id: users.id }).from(users).where(eq(users.owner_id, locals.accountId))
			)
		)
		.orderBy(asc(identity_members.created_at));
	return { maxIdentities: MAX_IDENTITIES, maxMembers: MAX_MEMBERS, members };
}) satisfies PageServerLoad;

// sharing looks accounts up by username, so it shouldn't be usable to probe for them quickly
const SHARE_WINDOW_MS = 60_000;
const MAX_SHARES = 20;

/** An identity owned by the signed in account, or null. */
async function ownedIdentity(locals: App.Locals, id: number | null) {
	if (!id || !locals.accountId) return null;
	const [identity] = await db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(and(eq(users.id, id), eq(users.owner_id, locals.accountId)));
	return identity ?? null;
}

/** Stops `accountId` from using the identity: its sessions acting as it go back to the account. */
async function removeMember(identityId: number, accountId: number) {
	const removed = await db
		.delete(identity_members)
		.where(
			and(eq(identity_members.identity_id, identityId), eq(identity_members.account_id, accountId))
		)
		.returning({ account_id: identity_members.account_id });
	await db
		.update(sessions)
		.set({ acting_id: null })
		.where(and(eq(sessions.user_id, accountId), eq(sessions.acting_id, identityId)));
	return removed.length > 0;
}

/** Makes `token` the active session, acting as `actingId` (null = the account itself). */
async function activate(
	locals: App.Locals,
	cookies: Cookies,
	token: string,
	actingId: number | null
) {
	await db.update(sessions).set({ acting_id: actingId }).where(eq(sessions.token, token));
	setSessionCookies(cookies, [
		token,
		...locals.sessions.map((s) => s.token).filter((t) => t !== token)
	]);
}

export const actions = {
	/** Switches to any account signed in on this browser, or to one of their identities. */
	switch: async ({ request, locals, cookies }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!locals.user || !id) return fail(400, { error: 'Invalid profile.' });

		const target = await findSessionFor(locals, id);
		if (!target) return fail(403, { error: "You can't switch to that profile." });

		await activate(locals, cookies, target.session.token, target.actingId);
		redirect(303, safeRedirect(data.get('redirectTo')));
	},

	/** Creates an identity owned by the signed in account and switches to it. */
	create: async ({ request, locals, cookies }) => {
		const accountId = locals.accountId;
		const session = locals.sessions[0];
		if (!locals.user || !accountId || !session) return fail(401, { error: 'Not logged in.' });

		const data = await request.formData();
		const field = (name: string) => {
			const value = data.get(name);
			return typeof value === 'string' ? value : '';
		};
		const name = field('fullName').trim();
		const username = field('username').trim().toLowerCase();
		const values = { name, username };

		const validationError = validateName(name) ?? validateUsername(username);
		if (validationError) return fail(400, { error: validationError, values });

		let created;
		try {
			created = await db.transaction(async (tx) => {
				// serialises concurrent creations so the limit can't be raced past
				await tx.select({ id: users.id }).from(users).where(eq(users.id, accountId)).for('update');
				const [{ n }] = await tx
					.select({ n: count() })
					.from(users)
					.where(eq(users.owner_id, accountId));
				if (n >= MAX_IDENTITIES) return null;
				const [identity] = await tx
					.insert(users)
					.values({ name, username, owner_id: accountId })
					.returning({ id: users.id });
				return identity;
			});
		} catch (e) {
			if (isUniqueViolation(e)) return fail(400, { error: 'Username already in use.', values });
			throw e;
		}
		if (!created)
			return fail(400, { error: `You can have at most ${MAX_IDENTITIES} identities.`, values });

		await activate(locals, cookies, session.token, created.id);
		redirect(303, `/@${username}`);
	},

	/** Permanently deletes one of the signed in account's identities, with its posts. Owner only. */
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!locals.user || !locals.accountId || !id) return fail(400, { error: 'Invalid profile.' });

		// collect the images first: the posts (and replies to them) go away with the identity
		const images = await imagesOfPostTrees(sql`user_id = ${id}`);
		const deleted = await db
			.delete(users)
			.where(and(eq(users.id, id), eq(users.owner_id, locals.accountId)))
			.returning({ id: users.id });
		if (deleted.length === 0) return fail(404, { error: 'Identity not found.' });
		await removeAvatarFiles(id);
		await removeUploads(images);

		// sessions acting as it fall back to the account (acting_id is ON DELETE SET NULL)
		redirect(303, '/accounts');
	},

	/** Shares one of the signed in account's identities with another account, by username. */
	share: async ({ request, locals }) => {
		const data = await request.formData();
		const identity = await ownedIdentity(locals, parseId(data.get('id')));
		if (!locals.accountId || !identity) return fail(404, { error: 'Identity not found.' });

		const key = `identity:share:${locals.accountId}`;
		if (isLimited(key, MAX_SHARES))
			return fail(429, { error: 'Too many attempts, try again in a minute.' });
		hit(key, SHARE_WINDOW_MS);

		const raw = data.get('username');
		const username = (typeof raw === 'string' ? raw : '').trim().replace(/^@/, '').toLowerCase();
		const shareError = { error: '', shareId: identity.id, username };
		if (validateUsername(username))
			return fail(400, { ...shareError, error: 'Enter a valid username.' });

		// only accounts can be given an identity: identities have no sessions of their own
		const [account] = await db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.username, username), isNull(users.owner_id), isNull(users.banned_at)));
		if (!account) return fail(404, { ...shareError, error: `No account named @${username}.` });
		if (account.id === locals.accountId)
			return fail(400, { ...shareError, error: 'You already own this identity.' });

		const added = await db.transaction(async (tx) => {
			// serialises concurrent shares so the limit can't be raced past
			await tx.select({ id: users.id }).from(users).where(eq(users.id, identity.id)).for('update');
			const [{ n }] = await tx
				.select({ n: count() })
				.from(identity_members)
				.where(eq(identity_members.identity_id, identity.id));
			if (n >= MAX_MEMBERS) return null;
			return tx
				.insert(identity_members)
				.values({ identity_id: identity.id, account_id: account.id })
				.onConflictDoNothing()
				.returning({ account_id: identity_members.account_id });
		});
		if (!added)
			return fail(400, {
				...shareError,
				error: `An identity can be shared with at most ${MAX_MEMBERS} accounts.`
			});
		if (added.length === 0)
			return fail(400, {
				...shareError,
				error: `@${identity.username} is already shared with @${username}.`
			});
		return { shared: true };
	},

	/** Stops sharing one of the signed in account's identities with an account. */
	unshare: async ({ request, locals }) => {
		const data = await request.formData();
		const identity = await ownedIdentity(locals, parseId(data.get('id')));
		const accountId = parseId(data.get('account'));
		if (!identity || !accountId) return fail(404, { error: 'Identity not found.' });
		if (!(await removeMember(identity.id, accountId)))
			return fail(404, { error: 'That account has no access to this identity.' });
		return { unshared: true };
	},

	/** Gives back an identity someone else shared with the signed in account. */
	leave: async ({ request, locals }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!locals.accountId || !id) return fail(400, { error: 'Invalid profile.' });
		if (!(await removeMember(id, locals.accountId)))
			return fail(404, { error: 'Identity not found.' });
		redirect(303, '/accounts');
	}
} satisfies Actions;
