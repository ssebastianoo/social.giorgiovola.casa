import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { db, passkeys, users } from '#lib/server/db/index.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { MAX_PASSKEYS, relyingParty, saveChallenge, userHandle } from '#lib/server/passkeys.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 30;

// passkeys belong to the account that is signed in, whichever of its profiles is in use
export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.accountId) return json({ error: 'You are not signed in.' }, { status: 401 });

	const key = `passkey:register:${locals.accountId}`;
	if (isLimited(key, MAX_PER_ACCOUNT))
		return json({ error: 'Too many attempts, try again later.' }, { status: 429 });
	hit(key, WINDOW_MS);

	const [account] = await db
		.select({ username: users.username, name: users.name })
		.from(users)
		.where(eq(users.id, locals.accountId));
	if (!account) return json({ error: 'You are not signed in.' }, { status: 401 });

	const existing = await db
		.select({ id: passkeys.id, transports: passkeys.transports })
		.from(passkeys)
		.where(eq(passkeys.user_id, locals.accountId));
	if (existing.length >= MAX_PASSKEYS)
		return json({ error: `You can have up to ${MAX_PASSKEYS} passkeys.` }, { status: 400 });

	const { rpID, rpName } = relyingParty(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userID: userHandle(locals.accountId),
		userName: account.username,
		userDisplayName: account.name,
		attestationType: 'none',
		// the authenticator refuses to make a second passkey for this account
		excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
		// discoverable, so signing in needs no username; verified, since it stands in for the password
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	saveChallenge(cookies, options.challenge, 'register', locals.accountId);
	return json(options);
};
