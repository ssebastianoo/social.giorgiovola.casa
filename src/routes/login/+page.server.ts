import type { Actions } from './$types';
import { verifyPassword } from '$lib/password';
import { sql } from '$lib/db';
import type postgres from 'postgres';
import type { User } from '$lib/types';
// import { randomUUID } from 'crypto';

export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();

		const username = data.get('username') as string | null;
		const password = data.get('password') as string | null;

		if (!username || !password) {
			return {
				error: 'Please fill out all fields.'
			};
		}

		let res: postgres.RowList<postgres.Row[]>;
		if (username.includes('@')) {
			res = await sql`
				SELECT * FROM users WHERE email = ${username}
			`;
		} else {
			res = await sql`
				SELECT * FROM users WHERE username = ${username}
			`;
		}
		if (res.length === 0) {
			return {
				error: 'User not found.'
			};
		}

		const correctPassword = await verifyPassword(password, res[0].salt, res[0].password);
		if (!correctPassword) {
			return {
				error: 'Wrong password.'
			};
		}

		const user: User = {
			email: res[0].email,
			name: res[0].name,
			username: res[0].username,
			avatar: res[0].avatar,
			created_at: res[0].created_at,
			id: res[0].id
		};

		const sessions = await sql`
			INSERT INTO sessions (user_id) VALUES (${user.id})
			RETURNING token
		`;
		cookies.set('social.giorgiovola.casa-token', sessions[0].token, {
			maxAge: 60 * 60 * 24 * 30
		});

		return {
			logged: true,
			user
		};
	}
} satisfies Actions;
