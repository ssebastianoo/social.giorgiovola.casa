import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sql } from '#lib/server/db.js';
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
	await sql`UPDATE sessions SET acting_id = ${actingId} WHERE token = ${token}`;
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
			created = await sql.begin(async (sql) => {
				// serialises concurrent creations so the limit can't be raced past
				await sql`SELECT id FROM users WHERE id = ${accountId} FOR UPDATE`;
				const count = await sql`SELECT COUNT(*)::int AS n FROM users WHERE owner_id = ${accountId}`;
				if (count[0].n >= MAX_IDENTITIES) return null;
				return await sql`
					INSERT INTO users (name, username, owner_id)
					VALUES (${name}, ${username}, ${accountId})
					RETURNING id
				`;
			});
		} catch (e) {
			if (isUniqueViolation(e)) return fail(400, { error: 'Username already in use.', values });
			throw e;
		}
		if (!created)
			return fail(400, { error: `You can have at most ${MAX_IDENTITIES} identities.`, values });

		await activate(locals, cookies, session.token, created[0].id);
		redirect(303, `/@${username}`);
	},

	/** Permanently deletes one of the signed in account's identities, with its posts. */
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!locals.user || !locals.accountId || !id) return fail(400, { error: 'Invalid profile.' });

		const deleted = await sql`
			DELETE FROM users WHERE id = ${id} AND owner_id = ${locals.accountId}
			RETURNING id
		`;
		if (deleted.length === 0) return fail(404, { error: 'Identity not found.' });
		await removeAvatarFiles(id);

		// sessions acting as it fall back to the account (acting_id is ON DELETE SET NULL)
		redirect(303, '/accounts');
	}
} satisfies Actions;
