import type { Actions } from './$types';
import { dummyVerify, hashPassword, verifyPassword } from '#lib/server/password.js';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users } from '#lib/server/db/index.js';
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
			? await db
					.select()
					.from(users)
					.where(and(sql`lower(${users.email}) = ${login}`, isNull(users.owner_id)))
					.orderBy(desc(sql`(${users.email} = ${username.trim()})`))
					.limit(1)
			: // identities have no password and can't be logged into directly
			  await db
					.select()
					.from(users)
					.where(and(eq(users.username, login), isNull(users.owner_id)));

		let ok = false;
		if (res.length > 0) {
			// accounts (owner_id IS NULL) always have a password and salt, see users_identity_check
			const { valid, needsRehash } = await verifyPassword(
				password,
				res[0].salt ?? '',
				res[0].password ?? ''
			);
			ok = valid;
			if (valid && needsRehash) {
				// upgrade legacy PBKDF2 hashes now that we know the plaintext
				const { salt, hash } = await hashPassword(password);
				await db.update(users).set({ password: hash, salt }).where(eq(users.id, res[0].id));
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

		// only said after the password checked out, so it can't be used to probe for accounts
		if (res[0].banned_at) {
			const reason = res[0].ban_reason ? ` Reason: ${res[0].ban_reason}` : '';
			return { error: `This account has been banned.${reason}` };
		}

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
