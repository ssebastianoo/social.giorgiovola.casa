import type { PageServerLoad } from './$types';
import { sql } from '$lib/db';

export const load = (async ({ cookies }) => {
	const sessionToken = cookies.get('social.giorgiovola.casa-token');

	if (sessionToken) {
		await sql`
			DELETE FROM sessions WHERE token = ${sessionToken}
		`;
		cookies.delete('social.giorgiovola.casa-token');
	}
}) satisfies PageServerLoad;
