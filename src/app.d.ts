// See https://kit.svelte.dev/docs/types#app

import type { User } from '#lib/types.js';
import type { SessionRef } from '#lib/server/session.js';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** the profile in use: an account or one of its identities */
			user: User | null;
			/** the account that is signed in (owner of `user` when it is an identity) */
			accountId: number | null;
			/** valid sessions on this browser, active first */
			sessions: SessionRef[];
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
