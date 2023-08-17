import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import fs from 'fs';
import { hashPassword } from '$lib/server/password';

export const PATCH: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const data = await request.formData();

	if (!data.get('fullName') || !data.get('username') || !data.get('email')) {
		return new Response('Missing fields', { status: 400 });
	}

	const name = data.get('fullName') as string;
	const email = data.get('email') as string;
	let username = data.get('username') as string;
	let avatar = data.get('avatar');
	const password = data.get('password');

	username = username.toLowerCase().replaceAll(' ', '');

	const check = await sql`
		SELECT username FROM users
		WHERE username = ${username}
		OR email = ${email}
	`;
	if (
		check.length > 0 &&
		check[0].username !== locals.user.username &&
		check[0].email !== locals.user.email
	) {
		return new Response('Username already in use.', { status: 400 });
	}

	let avatarPath: string | null = null;

	if (avatar && (avatar as File).size > 0) {
		avatar = avatar as File;
		const buffer = await avatar.arrayBuffer();
		const ext = avatar.type.split('/')[1];
		avatarPath = `/avatars/${locals.user.id}.${ext}`;
		await fs.promises.writeFile(`static${avatarPath}`, Buffer.from(buffer));
	}

	let crypt: null | {
		salt: string;
		hash: string;
	} = null;

	if (password) {
		const { salt, hash } = await hashPassword(password as string);
		crypt = { salt, hash };
	}

	const users = await sql`
		UPDATE users 
		SET
			name = ${name},
			username = ${username.toLowerCase().replaceAll(' ', '')},
			${avatarPath ? sql`avatar = ${avatarPath + '?hash=' + Date.now()},` : sql``}
			${crypt ? sql`password = ${crypt.hash}, salt = ${crypt.salt},` : sql``}
			email = ${email}
		WHERE id = ${locals.user.id}
		RETURNING id, name, username, email, avatar, created_at
	`;

	if (crypt) {
		const token = cookies.get('social.giorgiovola.casa-token');
		if (token) {
			await sql`
				DELETE FROM sessions
				WHERE token != ${token}
				AND user_id = ${locals.user.id}
			`;
		}
	}

	return new Response(JSON.stringify(users[0]));
};
