import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import {
	verifyAuthenticationResponse,
	type AuthenticationResponseJSON
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db, passkeys, users } from '#lib/server/db/index.js';
import { createSession } from '#lib/server/session.js';
import { clientIp, hit, isLimited } from '#lib/server/ratelimit.js';
import {
	isCredentialId,
	relyingParty,
	takeChallenge,
	userHandleBase64
} from '#lib/server/passkeys.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 30;
const FAILED = 'That passkey could not be verified.';

export const POST: RequestHandler = async ({ cookies, request, url, locals, getClientAddress }) => {
	const ip = clientIp(getClientAddress);
	const ipKey = ip ? `passkey:login:${ip}` : null;
	if (ipKey && isLimited(ipKey, MAX_FAILS_PER_IP))
		return json({ error: 'Too many failed attempts, try again in 15 minutes.' }, { status: 429 });
	const fail = (error: string, extra: Record<string, unknown> = {}) => {
		if (ipKey) hit(ipKey, WINDOW_MS);
		return json({ error, ...extra }, { status: 400 });
	};

	const pending = takeChallenge(cookies, 'login');
	if (!pending) return fail('The request expired, try again.');

	let response: AuthenticationResponseJSON;
	try {
		response = await request.json();
	} catch {
		return fail('Invalid request.');
	}
	if (!isCredentialId(response?.id)) return fail(FAILED);

	const [row] = await db
		.select({ passkey: passkeys, banned_at: users.banned_at, ban_reason: users.ban_reason })
		.from(passkeys)
		.innerJoin(users, eq(users.id, passkeys.user_id))
		.where(eq(passkeys.id, response.id));
	// `unknown` lets the browser hide a passkey that was deleted here but is still on the device
	if (!row) return fail('This passkey is no longer registered.', { unknown: true });

	const { passkey } = row;
	// the authenticator says which account it made the passkey for; it must be the owner
	const handle = response.response?.userHandle;
	if (handle && handle !== userHandleBase64(passkey.user_id)) return fail(FAILED);

	const { origin, rpID } = relyingParty(url);
	let info;
	try {
		const result = await verifyAuthenticationResponse({
			response,
			expectedChallenge: pending.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true,
			credential: {
				id: passkey.id,
				publicKey: isoBase64URL.toBuffer(passkey.public_key),
				counter: passkey.counter,
				transports: passkey.transports
			}
		});
		if (!result.verified) throw new Error('not verified');
		info = result.authenticationInfo;
	} catch {
		return fail(FAILED);
	}

	await db
		.update(passkeys)
		.set({
			counter: info.newCounter,
			backed_up: info.credentialBackedUp,
			last_used_at: sql`NOW()`
		})
		.where(eq(passkeys.id, passkey.id));

	// only said once the passkey checked out, same as the password login
	if (row.banned_at) {
		const reason = row.ban_reason ? ` Reason: ${row.ban_reason}` : '';
		return json({ error: `This account has been banned.${reason}` }, { status: 403 });
	}

	await createSession(cookies, passkey.user_id, locals.sessions);
	return json({ ok: true });
};
