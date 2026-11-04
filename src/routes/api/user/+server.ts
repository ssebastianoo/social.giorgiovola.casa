import type { RequestHandler } from './$types';
import { sql } from '#lib/server/db.js';
import fs from 'fs';
import { hashPassword } from '#lib/server/password.js';
import { SESSION_COOKIE } from '#lib/server/session.js';
import {
	LIMITS,
	isUniqueViolation,
	validateEmail,
	validateName,
	validatePassword,
	validateUsername
} from '#lib/server/validation.js';

const AVATAR_DIR = 'static/avatars';
const AVATAR_EXTS = ['png', 'jpg', 'gif', 'webp'];

/** Detects the image type from the file's magic bytes; the client-declared MIME type is not trusted. */
function sniffImage(buf: Buffer): string | null {
	if (
		buf.length >= 8 &&
		buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	)
		return 'png';
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
	const head = buf.subarray(0, 6).toString('latin1');
	if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
	if (
		buf.length >= 12 &&
		buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
		buf.subarray(8, 12).toString('latin1') === 'WEBP'
	)
		return 'webp';
	return null;
}

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

	if (!name || !username || email === '') {
		return bad('Missing fields');
	}

	// usernames created before validation existed are kept as long as they don't change
	const validationError =
		validateName(name) ??
		(email !== null ? validateEmail(email) : null) ??
		(username !== me.username ? validateUsername(username) : null) ??
		(password ? validatePassword(password) : null);
	if (validationError) return bad(validationError);

	const taken = await sql`
		SELECT username, email FROM users
		WHERE (username = ${username} ${email !== null ? sql`OR lower(email) = lower(${email})` : sql``})
		AND id != ${me.id}
	`;
	if (taken.some((u) => u.username === username)) return bad('Username already in use.');
	if (taken.length > 0) return bad('Email already in use.');

	let avatarPath: string | null = null;

	if (avatar instanceof File && avatar.size > 0) {
		if (avatar.size > LIMITS.avatarBytes) return bad('Avatar too big, max size is 10mb');
		const buffer = Buffer.from(await avatar.arrayBuffer());
		const ext = sniffImage(buffer);
		if (!ext) {
			return bad('Unsupported avatar type, use PNG, JPEG, GIF or WebP');
		}
		avatarPath = `/avatars/${me.id}.${ext}`;
		await fs.promises.writeFile(`static${avatarPath}`, buffer);
		// drop a previous avatar saved with a different extension
		for (const other of AVATAR_EXTS.filter((e) => e !== ext)) {
			await fs.promises.rm(`${AVATAR_DIR}/${me.id}.${other}`, { force: true });
		}
	}

	const crypt = password ? await hashPassword(password) : null;

	let users;
	try {
		users = await sql`
			UPDATE users
			SET
				name = ${name},
				${avatarPath ? sql`avatar = ${avatarPath + '?hash=' + Date.now()},` : sql``}
				${crypt ? sql`password = ${crypt.hash}, salt = ${crypt.salt},` : sql``}
				${email !== null ? sql`email = ${email},` : sql``}
				username = ${username}
			WHERE id = ${me.id}
			RETURNING id, name, username, email, avatar, created_at, owner_id
		`;
	} catch (e) {
		if (isUniqueViolation(e)) return bad('Username or email already in use.');
		throw e;
	}

	if (crypt) {
		// log out every other session after a password change
		const token = cookies.get(SESSION_COOKIE);
		await sql`
			DELETE FROM sessions
			WHERE user_id = ${me.id}
			${token ? sql`AND token != ${token}` : sql``}
		`;
	}

	return new Response(JSON.stringify(users[0]), {
		headers: { 'Content-Type': 'application/json' }
	});
};
