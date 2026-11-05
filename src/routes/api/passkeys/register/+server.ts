import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db, passkeys } from '#lib/server/db/index.js';
import { isUniqueViolation } from '#lib/server/validation.js';
import {
	MAX_PASSKEYS,
	PASSKEY_NAME_MAX,
	parsePasskeyName,
	relyingParty,
	takeChallenge
} from '#lib/server/passkeys.js';

export const POST: RequestHandler = async ({ locals, cookies, request, url }) => {
	if (!locals.accountId) return json({ error: 'You are not signed in.' }, { status: 401 });

	const pending = takeChallenge(cookies, 'register');
	// the challenge was issued to this account, not to another one signed in on the same browser
	if (!pending || pending.accountId !== locals.accountId)
		return json({ error: 'The request expired, try again.' }, { status: 400 });

	let body: { name?: unknown; response?: RegistrationResponseJSON };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, { status: 400 });
	}
	const name = parsePasskeyName(body?.name);
	if (!name)
		return json({ error: `Name must be at most ${PASSKEY_NAME_MAX} characters.` }, { status: 400 });

	const { origin, rpID } = relyingParty(url);
	let info;
	try {
		const result = await verifyRegistrationResponse({
			response: body.response as RegistrationResponseJSON,
			expectedChallenge: pending.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true
		});
		if (!result.verified) throw new Error('not verified');
		info = result.registrationInfo;
	} catch {
		return json({ error: 'The passkey could not be verified.' }, { status: 400 });
	}

	if ((await db.$count(passkeys, eq(passkeys.user_id, locals.accountId))) >= MAX_PASSKEYS)
		return json({ error: `You can have up to ${MAX_PASSKEYS} passkeys.` }, { status: 400 });

	try {
		await db.insert(passkeys).values({
			id: info.credential.id,
			user_id: locals.accountId,
			public_key: isoBase64URL.fromBuffer(info.credential.publicKey),
			counter: info.credential.counter,
			transports: info.credential.transports ?? [],
			name,
			backed_up: info.credentialBackedUp
		});
	} catch (e) {
		if (isUniqueViolation(e))
			return json({ error: 'This passkey is already registered.' }, { status: 400 });
		throw e;
	}
	return json({ ok: true });
};
