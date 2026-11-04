import type { Actions, PageServerLoad } from './$types';
import { SIGNUP_PASSWORD } from '$app/env/private';
import { sql } from '#lib/server/db.js';
import { hashPassword, secretsEqual } from '#lib/server/password.js';
import { createSession } from '#lib/server/session.js';
import { clientIp, hit, isLimited } from '#lib/server/ratelimit.js';
import {
	isUniqueViolation,
	validateEmail,
	validateName,
	validatePassword,
	validateUsername
} from '#lib/server/validation.js';
import type { User } from '#lib/types.js';

const WINDOW_MS = 15 * 60 * 1000;
// wrong signup passwords allowed per IP, and across everyone (covers the no-ADDRESS_HEADER case)
const MAX_FAILS_PER_IP = 10;
const MAX_FAILS_GLOBAL = 50;

type Result = {
	success: boolean;
	user?: User;
	errors?: string[];
};

export const load = (() => {
	return { registrationOpen: !!SIGNUP_PASSWORD };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, cookies, getClientAddress, locals }): Promise<Result> => {
		if (!SIGNUP_PASSWORD) {
			return { success: false, errors: ['Registration is closed.'] };
		}

		const data = await request.formData();
		const field = (name: string) => {
			const value = data.get(name);
			return typeof value === 'string' ? value : '';
		};
		const signupPassword = field('signupPassword');
		const email = field('email').trim();
		const name = field('fullName').trim();
		const username = field('username').trim().toLowerCase();
		const password = field('password');

		if (!signupPassword || !email || !name || !username || !password) {
			return { success: false, errors: ['Please fill out all fields.'] };
		}

		// checked before anything else so the form can't be used to probe for existing accounts
		const ip = clientIp(getClientAddress);
		const ipKey = ip ? `signup:ip:${ip}` : null;
		if (
			isLimited('signup:global', MAX_FAILS_GLOBAL) ||
			(ipKey && isLimited(ipKey, MAX_FAILS_PER_IP))
		) {
			return { success: false, errors: ['Too many attempts, try again later.'] };
		}
		if (!secretsEqual(signupPassword, SIGNUP_PASSWORD)) {
			hit('signup:global', WINDOW_MS);
			if (ipKey) hit(ipKey, WINDOW_MS);
			return { success: false, errors: ['Wrong signup password.'] };
		}

		const errorMessages = [
			validateEmail(email),
			validateName(name),
			validateUsername(username),
			validatePassword(password)
		].filter((e): e is string => e !== null);

		if (errorMessages.length === 0) {
			const taken = await sql`
				SELECT username, email FROM users
				WHERE username = ${username} OR lower(email) = lower(${email})
			`;
			if (taken.some((u) => u.email.toLowerCase() === email.toLowerCase()))
				errorMessages.push('Email already in use.');
			if (taken.some((u) => u.username === username))
				errorMessages.push('Username already in use.');
		}

		if (errorMessages.length > 0) {
			return { success: false, errors: errorMessages };
		}

		const { salt, hash } = await hashPassword(password);

		let res;
		try {
			res = await sql`
				INSERT INTO users (email, name, username, password, salt)
				VALUES (${email}, ${name}, ${username}, ${hash}, ${salt})
				returning id, email, name, username, avatar, created_at
			`;
		} catch (e) {
			// lost a race with a concurrent registration
			if (isUniqueViolation(e))
				return { success: false, errors: ['Username or email already in use.'] };
			throw e;
		}

		const user: User = {
			id: res[0].id,
			email: res[0].email,
			name: res[0].name,
			username: res[0].username,
			avatar: res[0].avatar,
			created_at: res[0].created_at,
			owner_id: null
		};

		await createSession(cookies, user.id, locals.sessions);

		return {
			success: true,
			user,
			errors: []
		};
	}
} satisfies Actions;
