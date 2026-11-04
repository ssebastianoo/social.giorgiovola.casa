import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { destroySession } from '#lib/server/session.js';

// Logging out is a POST action: a GET that changes state could be triggered by an <img>
// in a post or by SvelteKit's hover preloading.
export const actions = {
	default: async ({ cookies }) => {
		await destroySession(cookies);
		redirect(303, '/');
	}
} satisfies Actions;
