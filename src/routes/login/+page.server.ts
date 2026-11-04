import type { Actions } from './$types';
import { dummyVerify, hashPassword, verifyPassword } from '#lib/server/password.js';
import { sql } from '#lib/server/db.js';
import { createSession } from '#lib/server/session.js';
import { clear, clientIp, hit, isLimited } from '#lib/server/ratelimit.js';
import type { User } from '#lib/types.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ACCOUNT = 10;
const MAX_FAILS_PER_IP = 30;
const GENERIC_ERROR = 'Wrong username or password.';

export const actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		const data = await request.formData();

		const username = data.get('username');
		const password = data.get('password');

		if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
			return {
				error: 'Please fill out all fields.'
			};
		}

		const login = username.trim().toLowerCase();
		const accountKey = `login:account:${login}`;
		const ip = clientIp(getClientAddress);
		const ipKey = ip ? `login:ip:${ip}` : null;

		if (
			isLimited(accountKey, MAX_FAILS_PER_ACCOUNT) ||
			(ipKey && isLimited(ipKey, MAX_FAILS_PER_IP))
		) {
			return {
				error: 'Too many failed attempts, try again in 15 minutes.'
			};
		}

		const res = login.includes('@')
			? await sql`
					SELECT * FROM users WHERE lower(email) = ${login} AND owner_id IS NULL
					ORDER BY (email = ${username.trim()}) DESC LIMIT 1
				`
			: // identities have no password and can't be logged into directly
			  await sql`SELECT * FROM users WHERE username = ${login} AND owner_id IS NULL`;

		let ok = false;
		if (res.length > 0) {
			const { valid, needsRehash } = await verifyPassword(password, res[0].salt, res[0].password);
			ok = valid;
			if (valid && needsRehash) {
				// upgrade legacy PBKDF2 hashes now that we know the plaintext
				const { salt, hash } = await hashPassword(password);
				await sql`UPDATE users SET password = ${hash}, salt = ${salt} WHERE id = ${res[0].id}`;
			}
		} else {
			await dummyVerify(password);
		}

		if (!ok) {
			hit(accountKey, WINDOW_MS);
			if (ipKey) hit(ipKey, WINDOW_MS);
			return {
				error: GENERIC_ERROR
			};
		}
		clear(accountKey);

		const user: User = {
			email: res[0].email,
			name: res[0].name,
			username: res[0].username,
			avatar: res[0].avatar,
			created_at: res[0].created_at,
			id: res[0].id,
			owner_id: null
		};

		await createSession(cookies, user.id, locals.sessions);

		return {
			logged: true,
			user
		};
	}
} satisfies Actions;
