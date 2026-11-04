import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals }) => {
	if (!locals.user) redirect(307, '/login');
	redirect(307, `/@${locals.user.username}`);
}) satisfies PageServerLoad;
