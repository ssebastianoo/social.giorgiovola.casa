import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, eq } from 'drizzle-orm';
import { db, passkeys, users } from '#lib/server/db/index.js';
import {
	MAX_PASSKEYS,
	PASSKEY_NAME_MAX,
	isCredentialId,
	parsePasskeyName,
	relyingParty,
	userHandleBase64
} from '#lib/server/passkeys.js';

export const load = (async ({ locals, url }) => {
	if (!locals.user || !locals.accountId) redirect(303, '/login');

	const [account] = await db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, locals.accountId));
	const list = await db
		.select({
			id: passkeys.id,
			name: passkeys.name,
			backed_up: passkeys.backed_up,
			created_at: passkeys.created_at,
			last_used_at: passkeys.last_used_at
		})
		.from(passkeys)
		.where(eq(passkeys.user_id, locals.accountId))
		.orderBy(asc(passkeys.created_at));

	return {
		account: account.username,
		passkeys: list,
		maxPasskeys: MAX_PASSKEYS,
		// lets the page tell the browser which passkeys are still valid, so deleted ones disappear
		rpID: relyingParty(url).rpID,
		userHandle: userHandleBase64(locals.accountId)
	};
}) satisfies PageServerLoad;

export const actions = {
	renamePasskey: async ({ request, locals }) => {
		if (!locals.accountId) return fail(401, { error: 'You are not signed in.' });
		const data = await request.formData();
		const id = data.get('id');
		const name = parsePasskeyName(data.get('name'));
		if (!isCredentialId(id)) return fail(400, { error: 'Invalid passkey.' });
		if (!name) return fail(400, { error: `Name must be at most ${PASSKEY_NAME_MAX} characters.` });

		await db
			.update(passkeys)
			.set({ name })
			.where(and(eq(passkeys.id, id), eq(passkeys.user_id, locals.accountId)));
	},

	deletePasskey: async ({ request, locals }) => {
		if (!locals.accountId) return fail(401, { error: 'You are not signed in.' });
		const data = await request.formData();
		const id = data.get('id');
		if (!isCredentialId(id)) return fail(400, { error: 'Invalid passkey.' });

		// the password always stays, so deleting the last passkey can't lock anyone out
		await db
			.delete(passkeys)
			.where(and(eq(passkeys.id, id), eq(passkeys.user_id, locals.accountId)));
	}
} satisfies Actions;
