import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { clientIp, hit, isLimited } from '#lib/server/ratelimit.js';
import { relyingParty, saveChallenge } from '#lib/server/passkeys.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 100;

export const POST: RequestHandler = async ({ cookies, url, getClientAddress }) => {
	const ip = clientIp(getClientAddress);
	if (ip) {
		const key = `passkey:options:${ip}`;
		if (isLimited(key, MAX_PER_IP))
			return json({ error: 'Too many attempts, try again in 15 minutes.' }, { status: 429 });
		hit(key, WINDOW_MS);
	}

	// no allowCredentials: the browser offers every passkey it has for this site
	const options = await generateAuthenticationOptions({
		rpID: relyingParty(url).rpID,
		userVerification: 'required'
	});
	saveChallenge(cookies, options.challenge, 'login', null);
	return json(options);
};
