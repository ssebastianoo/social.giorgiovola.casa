import { and, desc, eq, sql } from 'drizzle-orm';
import { db, inbox } from '#lib/server/db/index.js';
import type { Notification } from '#lib/types.js';
import type { Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { parseId } from '#lib/server/validation.js';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const res = await db
		.select({
			id: inbox.id,
			// correlated subqueries: the table names are written out so they can't be mis-qualified
			sender: sql<Notification['sender']>`(
				SELECT jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar)
				FROM users u WHERE u.id = inbox.sender_id
			)`,
			user_id: inbox.user_id,
			post: sql<Notification['post']>`(
				SELECT jsonb_build_object('content', p.content, 'id', p.id)
				FROM posts p WHERE p.id = inbox.post_id
			)`,
			type: inbox.type,
			created_at: inbox.created_at,
			read_at: inbox.read_at
		})
		.from(inbox)
		.where(eq(inbox.user_id, locals.user.id))
		.orderBy(desc(inbox.created_at));
	return {
		notifications: res as Notification[]
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		if (!event.locals.user) error(401, 'Unauthorized');
		const formData = await event.request.formData();
		const id = parseId(formData.get('id'));
		if (id === null) error(400, 'Missing id');
		await db
			.update(inbox)
			.set({ read_at: sql`NOW()` })
			.where(and(eq(inbox.id, id), eq(inbox.user_id, event.locals.user.id)));
		return {
			status: 200
		};
	}
} satisfies Actions;
