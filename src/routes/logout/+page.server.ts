import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { destroyAllSessions, destroySession } from '#lib/server/session.js';

// Logging out is a POST action: a GET that changes state could be triggered by an <img>
// in a post or by SvelteKit's hover preloading.
export const actions = {
	// signs out the active account (and so its identities), switching to the next one
	current: async ({ cookies, locals }) => {
		await destroySession(cookies, locals.sessions);
		redirect(303, '/');
	},
	all: async ({ cookies }) => {
		await destroyAllSessions(cookies);
		redirect(303, '/');
	}
} satisfies Actions;
