import { sql } from '$lib/server/db';
import type { Notification } from '$lib/types';
import type { Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const res = await sql<Notification[]>`
    SELECT id,
    (
        SELECT jsonb_build_object(
            'id', id,
            'username', username,
            'name', name,
            'avatar', avatar
        ) FROM users WHERE id = sender_id
    ) as sender,
    user_id,
    (
        SELECT jsonb_build_object(
            'content', content,
            'id', id
        ) FROM posts WHERE id = post_id
    ) as post,
    type,
    created_at,
    read_at
    FROM inbox
    WHERE user_id = ${locals.user.id}
    ORDER BY created_at DESC
    `;
	return {
		notifications: res as Notification[]
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		if (!event.locals.user) throw error(401, 'Unauthorized');
		const formData = await event.request.formData();
		const id = parseId(formData.get('id'));
		if (id === null) throw error(400, 'Missing id');
		await sql`
        UPDATE inbox
        SET read_at = NOW()
        WHERE id = ${id} AND user_id = ${event.locals.user.id}
        `;
		return {
			status: 200
		};
	}
} satisfies Actions;
