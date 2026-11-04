import { randomBytes, pbkdf2, scrypt, timingSafeEqual, createHash } from 'crypto';

// ~32MB of memory per hash; maxmem has to be above 128 * N * r
const SCRYPT_OPTS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_PREFIX = 'scrypt$';

function scryptHex(password: string, salt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, SCRYPT_OPTS, (err, key) =>
			err ? reject(err) : resolve(key.toString('hex'))
		);
	});
}

// legacy hashes (no prefix): PBKDF2-SHA512 with 1000 iterations
function legacyHex(password: string, salt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		pbkdf2(password, salt, 1000, 64, 'sha512', (err, key) =>
			err ? reject(err) : resolve(key.toString('hex'))
		);
	});
}

function safeEqual(a: string, b: string) {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Constant-time comparison for secrets of arbitrary length. */
export function secretsEqual(a: string, b: string) {
	const ha = createHash('sha256').update(a).digest();
	const hb = createHash('sha256').update(b).digest();
	return timingSafeEqual(ha, hb);
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	return { salt, hash: SCRYPT_PREFIX + (await scryptHex(password, salt)) };
}

/** `needsRehash` is true when the stored hash uses the old weak scheme and should be replaced. */
export async function verifyPassword(password: string, salt: string, hash: string) {
	if (hash.startsWith(SCRYPT_PREFIX)) {
		const valid = safeEqual(SCRYPT_PREFIX + (await scryptHex(password, salt)), hash);
		return { valid, needsRehash: false };
	}
	const valid = safeEqual(await legacyHex(password, salt), hash);
	return { valid, needsRehash: valid };
}

/** Burns the same time as a real check, so missing accounts can't be detected by timing. */
export async function dummyVerify(password: string) {
	await scryptHex(password, 'dummy-salt-dummy-salt');
}
