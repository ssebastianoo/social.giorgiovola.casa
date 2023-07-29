import { error } from '@sveltejs/kit';
import type { Actions } from './$types';
import { sql } from '$lib/server/db';
import { hashPassword } from '$lib/server/password';
import type { User } from '$lib/types';

export const actions = {
	default: async ({
		request,
		cookies
	}): Promise<{
		success: boolean;
		user?: User;
		errors?: string[];
	}> => {
		const data = await request.formData();
		const email = data.get('email') as string | null;
		const name = data.get('fullName') as string | null;
		const username = data.get('username') as string | null;
		const password = data.get('password') as string | null;

		if (!email || !name || !username || !password) {
			throw error(400, {
				message: 'Please fill out all fields.'
			});
		}

		const errorMessages: string[] = [];

		const emailCheck = await sql`
			SELECT email FROM users WHERE email = ${email}
		`;
		if (emailCheck.length > 0) {
			errorMessages.push('Email already in use.');
		}
		const usernameCheck = await sql`
			SELECT username FROM users WHERE username = ${username}
		`;
		if (usernameCheck.length > 0) {
			errorMessages.push('Username already in use.');
		}

		if (errorMessages.length > 0) {
			return {
				success: false,
				errors: errorMessages
			};
		}

		const { salt, hash } = await hashPassword(password as string);

		const res = await sql`
			INSERT INTO users (email, name, username, password, salt)
			VALUES (${email}, ${name}, ${username.toLowerCase().replaceAll(' ', '')}, ${hash}, ${salt})
			returning id, email, name, username, avatar, created_at
			`;

		const user: User = {
			id: res[0].id,
			email: res[0].email,
			name: res[0].name,
			username: res[0].username,
			avatar: res[0].avatar,
			created_at: res[0].created_at
		};

		const sessions = await sql`
				INSERT INTO SESSIONS (user_id) VALUES (${user.id})
				RETURNING token
			`;
		cookies.set('social.giorgiovola.casa-token', sessions[0].token, {
			maxAge: 60 * 60 * 24 * 30
		});

		return {
			success: true,
			user,
			errors: []
		};
	}
} satisfies Actions;
