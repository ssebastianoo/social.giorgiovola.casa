import type { RequestHandler } from './$types';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { db, sessions, users } from '#lib/server/db/index.js';
import { normalizeBio, saveAvatar } from '#lib/server/profile.js';
import { hashPassword } from '#lib/server/password.js';
import { SESSION_COOKIE } from '#lib/server/session.js';
import {
	isUniqueViolation,
	parseWebsite,
	validateBio,
	validateEmail,
	validateName,
	validatePassword,
	validateUsername
} from '#lib/server/validation.js';

const bad = (message: string) => new Response(message, { status: 400 });

export const PATCH: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	const me = locals.user;
	// identities have no credentials: email and password can't be set on them
	const identity = me.owner_id !== null;

	const data = await request.formData();
	const field = (name: string) => {
		const value = data.get(name);
		return typeof value === 'string' ? value : '';
	};

	const name = field('fullName').trim();
	const email = identity ? null : field('email').trim();
	const username = field('username').trim().toLowerCase();
	const password = identity ? '' : field('password');
	const avatar = data.get('avatar');
	const bio = data.has('bio') ? normalizeBio(field('bio')) : null;

	const website = data.has('website') ? parseWebsite(field('website')) : null;
	if (website && 'error' in website) return bad(website.error);

	if (!name || !username || email === '') {
		return bad('Missing fields');
	}

	// usernames created before validation existed are kept as long as they don't change
	const validationError =
		validateName(name) ??
		(bio !== null ? validateBio(bio) : null) ??
		(email !== null ? validateEmail(email) : null) ??
		(username !== me.username ? validateUsername(username) : null) ??
		(password ? validatePassword(password) : null);
	if (validationError) return bad(validationError);

	const taken = await db
		.select({ username: users.username, email: users.email })
		.from(users)
		.where(
			and(
				or(
					eq(users.username, username),
					email !== null ? sql`lower(${users.email}) = lower(${email})` : undefined
				),
				ne(users.id, me.id)
			)
		);
	if (taken.some((u) => u.username === username)) return bad('Username already in use.');
	if (taken.length > 0) return bad('Email already in use.');

	let avatarPath: string | null = null;

	if (avatar instanceof File && avatar.size > 0) {
		const saved = await saveAvatar(me.id, Buffer.from(await avatar.arrayBuffer()));
		if ('error' in saved) return bad(saved.error);
		avatarPath = saved.avatar;
	}

	const crypt = password ? await hashPassword(password) : null;

	let updated;
	try {
		[updated] = await db
			.update(users)
			.set({
				name,
				username,
				...(bio !== null ? { bio } : {}),
				...(website ? { website: website.website } : {}),
				...(avatarPath ? { avatar: avatarPath } : {}),
				...(crypt ? { password: crypt.hash, salt: crypt.salt } : {}),
				...(email !== null ? { email } : {})
			})
			.where(eq(users.id, me.id))
			.returning({
				id: users.id,
				name: users.name,
				username: users.username,
				email: users.email,
				avatar: users.avatar,
				created_at: users.created_at,
				owner_id: users.owner_id
			});
	} catch (e) {
		if (isUniqueViolation(e)) return bad('Username or email already in use.');
		throw e;
	}

	if (crypt) {
		// log out every other session after a password change
		const token = cookies.get(SESSION_COOKIE);
		await db
			.delete(sessions)
			.where(and(eq(sessions.user_id, me.id), token ? ne(sessions.token, token) : undefined));
	}

	return new Response(JSON.stringify(updated), {
		headers: { 'Content-Type': 'application/json' }
	});
};
