import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, count, eq, sql } from 'drizzle-orm';
import { db, sessions, users } from '#lib/server/db/index.js';
import { imagesOfPostTrees, removeUploads } from '#lib/server/images.js';
import { setSessionCookies } from '#lib/server/session.js';
import {
	MAX_IDENTITIES,
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

export const load = (({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { maxIdentities: MAX_IDENTITIES };
}) satisfies PageServerLoad;

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

	/** Permanently deletes one of the signed in account's identities, with its posts. */
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
	}
} satisfies Actions;
