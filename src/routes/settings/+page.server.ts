import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { bots, db, passkeys, users } from '#lib/server/db/index.js';
import { MAX_BOTS, listBots, newToken } from '#lib/server/bots.js';
import { removeAvatarFiles } from '#lib/server/accounts.js';
import { updateProfile } from '#lib/server/profile.js';
import { imagesOfPostTrees, removeUploads } from '#lib/server/images.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { closeBotStreams } from '#lib/server/realtime.js';
import {
	isUniqueViolation,
	parseId,
	validateName,
	validateUsername
} from '#lib/server/validation.js';
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
		bots: await listBots(locals.accountId),
		maxBots: MAX_BOTS,
		account: account.username,
		passkeys: list,
		maxPasskeys: MAX_PASSKEYS,
		// lets the page tell the browser which passkeys are still valid, so deleted ones disappear
		rpID: relyingParty(url).rpID,
		userHandle: userHandleBase64(locals.accountId)
	};
}) satisfies PageServerLoad;

// bot tokens are secrets: creating and regenerating them shouldn't be scriptable at speed
const BOT_WINDOW_MS = 60_000;
const MAX_BOT_ACTIONS = 10;

/** One of the signed in account's bots, or null. */
async function ownedBot(accountId: number, id: number | null) {
	if (!id) return null;
	const [bot] = await db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(and(eq(users.id, id), eq(users.owner_id, accountId), eq(users.bot, true)));
	return bot ?? null;
}

export const actions = {
	/** Creates a bot owned by the signed in account. Its token is only shown in this response. */
	createBot: async ({ request, locals }) => {
		const accountId = locals.accountId;
		if (!accountId) return fail(401, { error: 'You are not signed in.' });
		const key = `bots:${accountId}`;
		if (isLimited(key, MAX_BOT_ACTIONS))
			return fail(429, { error: 'Too many attempts, try again in a minute.' });
		hit(key, BOT_WINDOW_MS);

		const data = await request.formData();
		const field = (name: string) => {
			const value = data.get(name);
			return typeof value === 'string' ? value : '';
		};
		const name = field('name').trim();
		const username = field('username').trim().replace(/^@/, '').toLowerCase();
		const botValues = { name, username };
		const validationError = validateName(name) ?? validateUsername(username);
		if (validationError) return fail(400, { error: validationError, botValues });

		const { token, hash } = newToken();
		let created;
		try {
			created = await db.transaction(async (tx) => {
				// serialises concurrent creations so the limit can't be raced past
				await tx.select({ id: users.id }).from(users).where(eq(users.id, accountId)).for('update');
				const [{ n }] = await tx
					.select({ n: count() })
					.from(users)
					.where(and(eq(users.owner_id, accountId), eq(users.bot, true)));
				if (n >= MAX_BOTS) return null;
				const [bot] = await tx
					.insert(users)
					.values({ name, username, owner_id: accountId, bot: true })
					.returning({ id: users.id });
				await tx.insert(bots).values({ user_id: bot.id, token_hash: hash });
				return bot;
			});
		} catch (e) {
			if (isUniqueViolation(e)) return fail(400, { error: 'Username already in use.', botValues });
			throw e;
		}
		if (!created) return fail(400, { error: `You can have at most ${MAX_BOTS} bots.`, botValues });
		return { botToken: { id: created.id, username, token } };
	},

	/** Replaces a bot's token: the old one stops working right away. */
	regenerateToken: async ({ request, locals }) => {
		const accountId = locals.accountId;
		if (!accountId) return fail(401, { error: 'You are not signed in.' });
		const key = `bots:${accountId}`;
		if (isLimited(key, MAX_BOT_ACTIONS))
			return fail(429, { error: 'Too many attempts, try again in a minute.' });
		hit(key, BOT_WINDOW_MS);

		const data = await request.formData();
		const bot = await ownedBot(accountId, parseId(data.get('id')));
		if (!bot) return fail(404, { error: 'Bot not found.' });
		const { token, hash } = newToken();
		await db
			.update(bots)
			.set({ token_hash: hash, created_at: sql`NOW()`, last_used_at: null })
			.where(eq(bots.user_id, bot.id));
		closeBotStreams([bot.id]);
		return { botToken: { id: bot.id, username: bot.username, token } };
	},

	/** Edits a bot's profile: name, username, bio, website and avatar. */
	editBot: async ({ request, locals }) => {
		const accountId = locals.accountId;
		if (!accountId) return fail(401, { error: 'You are not signed in.' });
		const key = `bots:${accountId}`;
		if (isLimited(key, MAX_BOT_ACTIONS))
			return fail(429, { error: 'Too many attempts, try again in a minute.' });
		hit(key, BOT_WINDOW_MS);

		const data = await request.formData();
		const bot = await ownedBot(accountId, parseId(data.get('id')));
		if (!bot) return fail(404, { error: 'Bot not found.' });
		const field = (name: string) => {
			const value = data.get(name);
			return typeof value === 'string' ? value : '';
		};
		const file = data.get('avatar');
		const avatar =
			file instanceof File && file.size > 0
				? Buffer.from(await file.arrayBuffer())
				: data.get('removeAvatar')
				? null
				: undefined;

		const result = await updateProfile(
			bot.id,
			bot.username,
			{
				name: field('name'),
				username: field('username'),
				bio: field('bio'),
				website: field('website')
			},
			avatar
		);
		if ('error' in result) return fail(400, { error: result.error, editedBot: bot.id });
		// the stream matches mentions against the username it was opened with
		if (result.profile.username !== bot.username) closeBotStreams([bot.id]);
		return { editedBot: bot.id, saved: true };
	},

	/** Permanently deletes a bot with its posts. */
	deleteBot: async ({ request, locals }) => {
		const accountId = locals.accountId;
		if (!accountId) return fail(401, { error: 'You are not signed in.' });
		const key = `bots:${accountId}`;
		if (isLimited(key, MAX_BOT_ACTIONS))
			return fail(429, { error: 'Too many attempts, try again in a minute.' });
		hit(key, BOT_WINDOW_MS);
		const data = await request.formData();
		const bot = await ownedBot(accountId, parseId(data.get('id')));
		if (!bot) return fail(404, { error: 'Bot not found.' });

		// collect the images first: replies to its posts go away with them
		const images = await imagesOfPostTrees(sql`user_id = ${bot.id}`);
		await db
			.delete(users)
			.where(and(eq(users.id, bot.id), eq(users.owner_id, accountId), eq(users.bot, true)));
		closeBotStreams([bot.id]);
		await removeAvatarFiles(bot.id);
		await removeUploads(images);
		return { deletedBot: true };
	},

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
