import type { Cookies } from '@sveltejs/kit';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { PUBLIC_URL } from '$app/env/public';

/** How many passkeys one account can register. */
export const MAX_PASSKEYS = 20;
export const PASSKEY_NAME_MAX = 64;

const CHALLENGE_COOKIE = 'social.giorgiovola.casa-passkey';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
// caps memory if someone requests options in a loop without ever finishing a ceremony
const MAX_CHALLENGES = 10_000;

type Ceremony = 'register' | 'login';
type Pending = { challenge: string; ceremony: Ceremony; accountId: number | null; expires: number };

// challenges live in memory like the rate limits: a restart only fails ceremonies in progress
const pending = new Map<string, Pending>();

setInterval(() => {
	const now = Date.now();
	for (const [key, p] of pending) if (p.expires <= now) pending.delete(key);
}, 60_000).unref?.();

const cookieOptions = { path: '/', httpOnly: true, sameSite: 'strict' } as const;

/** The relying party: passkeys are bound to the public hostname, so PUBLIC_URL wins over the request. */
export function relyingParty(url: URL) {
	const origin = PUBLIC_URL ? new URL(PUBLIC_URL).origin : url.origin;
	const rpID = new URL(origin).hostname;
	return { origin, rpID, rpName: rpID };
}

/** The WebAuthn user handle of an account. Stable, so an authenticator keeps one passkey per account. */
export function userHandle(accountId: number) {
	return new TextEncoder().encode(String(accountId));
}

export function userHandleBase64(accountId: number) {
	return isoBase64URL.fromBuffer(userHandle(accountId));
}

/** Remembers `challenge` for this browser; a new ceremony replaces the previous one. */
export function saveChallenge(
	cookies: Cookies,
	challenge: string,
	ceremony: Ceremony,
	accountId: number | null
) {
	const old = cookies.get(CHALLENGE_COOKIE);
	if (old) pending.delete(old);
	// maps iterate in insertion order, so this drops the oldest
	for (const key of pending.keys()) {
		if (pending.size < MAX_CHALLENGES) break;
		pending.delete(key);
	}

	const key = crypto.randomUUID();
	pending.set(key, { challenge, ceremony, accountId, expires: Date.now() + CHALLENGE_TTL_MS });
	cookies.set(CHALLENGE_COOKIE, key, { ...cookieOptions, maxAge: CHALLENGE_TTL_MS / 1000 });
}

/** The pending challenge of this browser for `ceremony`, usable once. */
export function takeChallenge(cookies: Cookies, ceremony: Ceremony): Pending | null {
	const key = cookies.get(CHALLENGE_COOKIE);
	if (!key) return null;
	cookies.delete(CHALLENGE_COOKIE, cookieOptions);
	const p = pending.get(key);
	pending.delete(key);
	if (!p || p.ceremony !== ceremony || p.expires <= Date.now()) return null;
	return p;
}

/** Trimmed passkey name, or null when it doesn't fit. Empty falls back to `fallback`. */
export function parsePasskeyName(value: unknown, fallback = 'Passkey'): string | null {
	if (value !== undefined && value !== null && typeof value !== 'string') return null;
	const name = (value ?? '').trim() || fallback;
	return name.length <= PASSKEY_NAME_MAX ? name : null;
}

/** Credential ids are base64url; anything else can't be one of ours. */
export function isCredentialId(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 1024 && /^[A-Za-z0-9_-]+$/.test(value);
}
